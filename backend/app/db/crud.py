from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from . import models
from datetime import datetime
from typing import List, Optional

# ========== Part CRUD ==========

def get_part_by_name(db: Session, name: str) -> Optional[models.Part]:
    """정식 부품명으로 부품 조회"""
    return db.query(models.Part).filter(models.Part.name == name).first()

def get_part_by_id(db: Session, part_id: int) -> Optional[models.Part]:
    """ID로 부품 조회"""
    return db.query(models.Part).filter(models.Part.id == part_id).first()

def get_all_parts(db: Session, skip: int = 0, limit: int = 1000) -> List[models.Part]:
    """모든 부품 조회"""
    return db.query(models.Part).offset(skip).limit(limit).all()

def update_part(
    db: Session,
    part_id: int,
    name: Optional[str],
    description: Optional[str],
    is_confirmed: Optional[bool] = None,
) -> Optional[models.Part]:
    """부품 정보 수정"""
    part = get_part_by_id(db, part_id)
    if not part:
        return None

    if name:
        trimmed_name = name.strip()
        if not trimmed_name:
            raise ValueError("정식 부품명은 비워둘 수 없습니다.")

        if trimmed_name != part.name:
            existing = get_part_by_name(db, trimmed_name)
            if existing and existing.id != part.id:
                raise ValueError("이미 동일한 정식 부품명이 존재합니다.")
            part.name = trimmed_name

    if description is not None:
        part.description = description.strip() or None

    if is_confirmed is not None:
        if is_confirmed and not part.is_confirmed:
            part.is_confirmed = True
            part.confirmed_at = datetime.utcnow()
        elif not is_confirmed and part.is_confirmed:
            part.is_confirmed = False
            part.confirmed_at = None

    db.commit()
    db.refresh(part)
    return part

def merge_parts(db: Session, source_part_id: int, target_part_id: int) -> models.Part:
    """정식 부품명 병합 (source -> target)"""
    if source_part_id == target_part_id:
        raise ValueError("동일한 부품끼리는 병합할 수 없습니다.")

    source = get_part_by_id(db, source_part_id)
    target = get_part_by_id(db, target_part_id)

    if not source or not target:
        raise ValueError("병합 대상 부품을 찾을 수 없습니다.")

    target_alias_lookup = {mapping.alias: mapping for mapping in target.mappings}
    source_alias_name = source.name

    for mapping in list(source.mappings):
        existing = target_alias_lookup.get(mapping.alias)
        if existing:
            existing.usage_count = (existing.usage_count or 0) + (mapping.usage_count or 0)
            existing.confidence_score = max(existing.confidence_score or 0.0, mapping.confidence_score or 0.0)
            if mapping.last_used and (existing.last_used is None or mapping.last_used > existing.last_used):
                existing.last_used = mapping.last_used
            db.delete(mapping)
        else:
            mapping.part_id = target.id

    for history in list(source.usage_history):
        history.part_id = target.id

    cleaned_source_alias = source_alias_name.strip()
    if cleaned_source_alias and cleaned_source_alias.lower() != target.name.strip().lower():
        existing_source_alias = get_mapping_by_alias(db, cleaned_source_alias)
        if existing_source_alias and existing_source_alias.part_id == target.id:
            existing_source_alias.usage_count = (existing_source_alias.usage_count or 0) + len(source.usage_history)
        else:
            if existing_source_alias and existing_source_alias.part_id != target.id:
                db.delete(existing_source_alias)
                db.flush()
            models_alias = models.PartMapping(
                alias=cleaned_source_alias,
                part_id=target.id,
                confidence_score=1.0,
                usage_count=len(source.usage_history),
            )
            db.add(models_alias)

    db.delete(source)
    db.commit()
    db.refresh(target)
    return target

def delete_part(db: Session, part_id: int) -> None:
    """정식 부품 삭제"""
    part = get_part_by_id(db, part_id)
    if not part:
        raise ValueError("정식 부품명을 찾을 수 없습니다.")

    db.delete(part)
    db.commit()

def create_part(
    db: Session,
    name: str,
    description: Optional[str] = None,
    is_confirmed: bool = False,
) -> models.Part:
    """새 부품 생성"""
    trimmed_name = (name or "").strip()
    if not trimmed_name:
        raise ValueError("정식 부품명은 비워둘 수 없습니다.")

    existing = get_part_by_name(db, trimmed_name)
    if existing:
        raise ValueError("이미 동일한 정식 부품명이 존재합니다.")

    cleaned_description = description.strip() if description else None

    part = models.Part(
        name=trimmed_name,
        description=cleaned_description or None,
        is_confirmed=bool(is_confirmed),
    )
    if part.is_confirmed:
        part.confirmed_at = datetime.utcnow()

    db.add(part)
    db.commit()
    db.refresh(part)
    return part

def get_or_create_part(db: Session, name: str) -> models.Part:
    """부품명으로 조회하거나 없으면 생성"""
    part = get_part_by_name(db, name)
    if not part:
        part = create_part(db, name)
    return part


# ========== PartMapping CRUD ==========

def get_mapping_by_alias(db: Session, alias: str) -> Optional[models.PartMapping]:
    """별칭으로 매핑 조회"""
    return db.query(models.PartMapping).filter(models.PartMapping.alias == alias).first()

def get_mapping_by_id(db: Session, mapping_id: int) -> Optional[models.PartMapping]:
    """ID로 별칭 매핑 조회"""
    return db.query(models.PartMapping).filter(models.PartMapping.id == mapping_id).first()

def create_or_update_mapping(
    db: Session,
    alias: str,
    part_name: str,
    confidence_score: float = 1.0
) -> models.PartMapping:
    """별칭 매핑 생성 또는 업데이트"""
    # 정식 부품명 조회 또는 생성
    part = get_or_create_part(db, part_name)

    # 기존 매핑 조회
    mapping = get_mapping_by_alias(db, alias)

    if mapping:
        # 기존 매핑 업데이트
        mapping.part_id = part.id
        mapping.confidence_score = confidence_score
        mapping.usage_count += 1
        mapping.last_used = datetime.utcnow()
    else:
        # 새 매핑 생성
        mapping = models.PartMapping(
            alias=alias,
            part_id=part.id,
            confidence_score=confidence_score
        )
        db.add(mapping)

    db.commit()
    db.refresh(mapping)
    return mapping

def get_all_mappings(db: Session) -> List[models.PartMapping]:
    """모든 별칭 매핑 조회"""
    return db.query(models.PartMapping).all()

def create_alias(
    db: Session,
    part_id: int,
    alias: str,
    confidence_score: float = 1.0
) -> models.PartMapping:
    """별칭 직접 추가"""
    part = get_part_by_id(db, part_id)
    if not part:
        raise ValueError("정식 부품명을 찾을 수 없습니다.")

    cleaned_alias = alias.strip()
    if not cleaned_alias:
        raise ValueError("별칭은 비워둘 수 없습니다.")

    existing = get_mapping_by_alias(db, cleaned_alias)
    if existing and existing.part_id != part.id:
        raise ValueError("이미 다른 부품에 연결된 별칭입니다.")

    if existing:
        existing.part_id = part.id
        existing.confidence_score = confidence_score
        db.commit()
        db.refresh(existing)
        return existing

    mapping = models.PartMapping(
        alias=cleaned_alias,
        part_id=part.id,
        confidence_score=confidence_score,
        usage_count=0,
    )
    db.add(mapping)
    db.commit()
    db.refresh(mapping)
    return mapping

def update_alias(
    db: Session,
    mapping_id: int,
    alias: Optional[str] = None,
    confidence_score: Optional[float] = None,
) -> models.PartMapping:
    """별칭 수정"""
    mapping = get_mapping_by_id(db, mapping_id)
    if not mapping:
        raise ValueError("별칭을 찾을 수 없습니다.")

    if alias is not None:
        cleaned_alias = alias.strip()
        if not cleaned_alias:
            raise ValueError("별칭은 비워둘 수 없습니다.")
        existing = get_mapping_by_alias(db, cleaned_alias)
        if existing and existing.id != mapping.id:
            raise ValueError("이미 다른 별칭 항목이 동일한 값을 사용 중입니다.")
        mapping.alias = cleaned_alias

    if confidence_score is not None:
        mapping.confidence_score = confidence_score

    db.commit()
    db.refresh(mapping)
    return mapping

def delete_alias(db: Session, mapping_id: int) -> None:
    """별칭 삭제"""
    mapping = get_mapping_by_id(db, mapping_id)
    if not mapping:
        raise ValueError("별칭을 찾을 수 없습니다.")

    db.delete(mapping)
    db.commit()


# ========== PartUsageHistory CRUD ==========

def record_part_usage(db: Session, part_name: str, input_text: str) -> models.PartUsageHistory:
    """부품 사용 이력 기록"""
    part = get_or_create_part(db, part_name)

    history = models.PartUsageHistory(
        part_id=part.id,
        input_text=input_text
    )
    db.add(history)
    db.commit()
    db.refresh(history)

    return history

def get_recent_usage(db: Session, limit: int = 100) -> List[models.PartUsageHistory]:
    """최근 사용 이력 조회"""
    return db.query(models.PartUsageHistory).order_by(
        desc(models.PartUsageHistory.created_at)
    ).limit(limit).all()

def get_popular_parts(db: Session, limit: int = 20) -> List[tuple]:
    """자주 사용되는 부품 조회 (사용 횟수 기준)"""
    return db.query(
        models.Part.name,
        func.count(models.PartUsageHistory.id).label('usage_count')
    ).join(
        models.PartUsageHistory
    ).group_by(
        models.Part.id
    ).order_by(
        desc('usage_count')
    ).limit(limit).all()
