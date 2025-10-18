"""
부품명/별칭을 정규화하여 자동완성 품질을 향상시키는 스크립트.

핵심 기능
- 엔진오일 용량 구분 항목을 '엔진오일'로 통합
- '썸머' 계열 오탈자를 써모스탯 계열 명칭으로 정리
- '호수' → '호스', '히타' → '히터' 등 반복되는 오타를 일괄 보정
- 정식 명칭으로 이관 후 기존 사용 이력/별칭 매핑을 유지

실행 방법
    python backend/scripts/normalize_parts.py
"""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Sequence, Tuple

from sqlalchemy import desc
from sqlalchemy.orm import Session

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.db import SessionLocal, crud, models  # noqa: E402

# === 설정 ===

CANONICAL_DESCRIPTIONS: Dict[str, str] = {
    "엔진오일": "엔진 윤활유 (용량 구분 제거)",
    "써모스탯": "엔진 냉각수 온도 조절 밸브 (Thermostat)",
    "써모스탯 가스켓": "써모스탯 하우징용 가스켓",
    "써모스탯 세트": "써모스탯과 가스켓 교체 키트",
    "히터 호스": "히터 코어 냉각수 호스",
}

MANUAL_ALIAS_MAP: Dict[str, str] = {
    # 엔진오일 파생
    "엔진오일 13리터": "엔진오일",
    "엔진오일 24": "엔진오일",
    "엔진오일 26L": "엔진오일",
    "엔진오일 40L": "엔진오일",
    "엔진오일20리터": "엔진오일",
    "오일24": "엔진오일",

    # 썸머/써모스탯 계열
    "썸머스타트": "써모스탯",
    "썸머 S/T": "써모스탯",
    "썸머SA": "써모스탯",
    "썸머 G/S": "써모스탯 가스켓",
    "썸머S/T,G/T": "써모스탯 세트",
    "사모스타트": "써모스탯",
    "쌤머스타트": "써모스탯",

    # 히터 호스 계열
    "히타호수": "히터 호스",
    "히타 호스": "히터 호스",
    "히타호스": "히터 호스",
    "히터호수": "히터 호스",
    "히터호스": "히터 호스",
}

# === 로깅 구조 ===

@dataclass
class ActionLog:
    canonical_parts: set[str] = field(default_factory=set)
    deleted_parts: set[str] = field(default_factory=set)
    alias_mapped: Dict[str, str] = field(default_factory=dict)  # alias -> canonical
    migrated_usage: Dict[str, int] = field(default_factory=dict)  # alias -> moved count


# === 유틸 함수 ===

SPACE_RE = re.compile(r"\s+")
SPACELESS_RE = re.compile(r"\s+")
HOSE_ATTACH_RE = re.compile(r"([A-Za-z가-힣]+)호스")
HITA_RE = re.compile(r"히타(?=\s*호)")


def apply_common_fixes(name: str) -> str:
    """반복 오타 및 형태를 정규화"""
    fixed = name.strip()
    fixed = fixed.replace("호수", "호스")
    fixed = HITA_RE.sub("히터", fixed)
    fixed = HOSE_ATTACH_RE.sub(lambda m: f"{m.group(1)} 호스", fixed)
    fixed = SPACE_RE.sub(" ", fixed).strip()
    return fixed


def spacing_signature(name: str) -> str:
    """공백 여부에 따른 병합 판단 키 생성"""
    return SPACELESS_RE.sub("", name)


def build_spacing_canonical_map(parts: Sequence["models.Part"]) -> Dict[str, str]:
    """공백만 다른 명칭을 하나의 대표 명칭으로 묶는 매핑 생성"""
    manual_targets = set(MANUAL_ALIAS_MAP.values())
    canonical_keys: Dict[str, set[str]] = {}

    for part in parts:
        normalized = apply_common_fixes(part.name)
        key = spacing_signature(normalized)
        canonical_keys.setdefault(key, set()).add(normalized)

    def sort_key(name: str) -> Tuple[int, int, int, int, str]:
        no_space_length = len(spacing_signature(name))
        return (
            0 if name in manual_targets or name in CANONICAL_DESCRIPTIONS else 1,
            0 if " " in name else 1,
            no_space_length,
            len(name),
            name,
        )

    return {key: sorted(names, key=sort_key)[0] for key, names in canonical_keys.items()}


def infer_canonical(name: str) -> Tuple[str, str | None]:
    """주어진 부품명의 정식 명칭과 설명을 판별"""
    # 1) 공통 오타 보정
    normalized = apply_common_fixes(name)

    # 2) 수동 매핑
    manual = MANUAL_ALIAS_MAP.get(normalized)
    if manual:
        canonical = manual
    else:
        canonical = normalized

    # 3) 패턴 기반 추가 규칙
    if "엔진오일" in canonical:
        canonical = "엔진오일"
    if canonical.startswith("써모 ") or canonical.startswith("써머 "):
        canonical = canonical.replace("써머", "써모", 1)

    description = CANONICAL_DESCRIPTIONS.get(canonical)
    return canonical, description


def update_mapping_stats(db: Session, part_id: int, alias: str) -> Tuple[int, datetime | None]:
    """별칭 매핑의 사용 횟수와 최종 사용일을 실제 데이터로 동기화"""
    usage_count = (
        db.query(models.PartUsageHistory)
        .filter(
            models.PartUsageHistory.part_id == part_id,
            models.PartUsageHistory.input_text == alias,
        )
        .count()
    )
    last_history = (
        db.query(models.PartUsageHistory)
        .filter(
            models.PartUsageHistory.part_id == part_id,
            models.PartUsageHistory.input_text == alias,
        )
        .order_by(desc(models.PartUsageHistory.created_at))
        .first()
    )

    mapping = crud.get_mapping_by_alias(db, alias)
    if mapping:
        mapping.usage_count = usage_count
        mapping.last_used = last_history.created_at if last_history else None
        mapping.confidence_score = 1.0
    return usage_count, last_history.created_at if last_history else None


# === 메인 로직 ===

def normalize() -> ActionLog:
    log = ActionLog()

    with SessionLocal() as db:
        parts = db.query(models.Part).order_by(models.Part.id).all()
        spacing_canonical_map = build_spacing_canonical_map(parts)

        for part in parts:
            canonical_name, description = infer_canonical(part.name)
            preferred_spacing_name = spacing_canonical_map.get(spacing_signature(canonical_name))
            if preferred_spacing_name:
                canonical_name = preferred_spacing_name

            if canonical_name == part.name:
                # 정식 명칭 자체인 경우 설명만 업데이트
                if description and part.description != description:
                    part.description = description
                    db.commit()
                log.canonical_parts.add(part.name)
                continue

            target_part = crud.get_or_create_part(db, canonical_name)
            if description and target_part.description != description:
                target_part.description = description

            # 별칭 매핑 생성/갱신
            crud.create_or_update_mapping(
                db,
                alias=part.name,
                part_name=target_part.name,
                confidence_score=1.0,
            )
            log.alias_mapped[part.name] = target_part.name

            # 기존 사용 이력/별칭을 정식 명칭으로 이동
            migrated = (
                db.query(models.PartUsageHistory)
                .filter(models.PartUsageHistory.part_id == part.id)
                .update(
                    {models.PartUsageHistory.part_id: target_part.id},
                    synchronize_session=False,
                )
            )
            if migrated:
                log.migrated_usage[part.name] = migrated

            db.query(models.PartMapping).filter(
                models.PartMapping.part_id == part.id
            ).update(
                {models.PartMapping.part_id: target_part.id},
                synchronize_session=False,
            )

            log.deleted_parts.add(part.name)
            db.delete(part)
            db.commit()

            update_mapping_stats(db, target_part.id, part.name)
            db.commit()

            log.canonical_parts.add(target_part.name)

    return log


def main() -> None:
    actions = normalize()

    print("=== Normalization Summary ===")
    print("정식 명칭 기준:")
    for name in sorted(actions.canonical_parts):
        print(f" - {name}")

    if actions.deleted_parts:
        print("\n삭제된 중복/오타 항목:")
        for name in sorted(actions.deleted_parts):
            print(f" - {name}")

    print("\n별칭 매핑 업데이트:")
    for alias, canonical in sorted(actions.alias_mapped.items()):
        moved = actions.migrated_usage.get(alias, 0)
        moved_info = f" (이력 {moved}건 이동)" if moved else ""
        print(f" - {alias} -> {canonical}{moved_info}")


if __name__ == "__main__":
    main()
