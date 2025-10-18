from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session
from pathlib import Path
import shutil
from datetime import datetime
from urllib.parse import quote

from ..db import get_db, crud
from ..excel.parser import ExcelParser
from ..excel.generator import ExcelGenerator
from ..config import settings
from ..ml.fuzzy_matcher import fuzzy_matcher

router = APIRouter()

class PartSuggestion(BaseModel):
    """부품명 추천 모델"""
    name: str
    score: float
    usage_count: int
    last_used: str | None = None
    is_confirmed: bool

class PartSearchRequest(BaseModel):
    """부품명 검색 요청"""
    query: str
    limit: int = 10

class PartRecordRequest(BaseModel):
    """부품명 사용 이력 기록 요청"""
    part_name: str
    input_text: str | None = None

class PartAliasInfo(BaseModel):
    """별칭 정보"""
    mapping_id: int
    alias: str
    confidence_score: float
    usage_count: int
    last_used: Optional[str] = None

class PartMappingInfo(BaseModel):
    """부품 및 별칭 현황"""
    part_id: int
    name: str
    description: Optional[str] = None
    is_confirmed: bool
    confirmed_at: Optional[str] = None
    usage_count: int
    aliases: List[PartAliasInfo]

class UpdatePartRequest(BaseModel):
    """정식 부품명 수정 요청"""
    name: str
    description: Optional[str] = None
    is_confirmed: Optional[bool] = None


class CreatePartRequest(BaseModel):
    """정식 부품명 추가 요청"""
    name: str
    description: Optional[str] = None
    is_confirmed: Optional[bool] = False

class MergePartRequest(BaseModel):
    """정식 부품명 병합 요청"""
    target_part_id: Optional[int] = None
    target_part_name: Optional[str] = None

class CreateAliasRequest(BaseModel):
    """별칭 추가 요청"""
    alias: str
    confidence_score: float = 1.0

class UpdateAliasRequest(BaseModel):
    """별칭 수정 요청"""
    alias: Optional[str] = None
    confidence_score: Optional[float] = None

class PartItem(BaseModel):
    """부품 아이템 정보"""
    name: str
    specification: Optional[str] = None  # 규격
    quantity: Optional[float] = None  # 수량
    unit_price: Optional[float] = None  # 단가
    supply_price: Optional[float] = None  # 공급가액 (직접 입력 또는 자동 계산)
    # 세액은 엑셀 템플릿의 수식으로 자동 계산됨

class GenerateExcelRequest(BaseModel):
    """엑셀 생성 요청"""
    items: List[PartItem]  # 부품 목록 (상세 정보 포함)
    vehicle_number: Optional[str] = None
    invoice_date: Optional[str] = None  # YYYY-MM-DD 형식

@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {"status": "ok", "message": "PartMatch API is running"}

@router.post("/parts/search", response_model=List[PartSuggestion])
async def search_parts(request: PartSearchRequest, db: Session = Depends(get_db)):
    """
    부품명 유사도 검색 (RapidFuzz 기반)
    - query: 검색할 부품명 (일부분이라도 가능)
    - limit: 최대 결과 수
    """
    # RapidFuzz를 사용한 유사도 검색
    results = fuzzy_matcher.search_parts_in_db(
        query=request.query,
        db=db,
        limit=request.limit
    )

    # PartSuggestion 모델로 변환
    suggestions = [
        PartSuggestion(
            name=result["name"],
            score=result["score"],
            usage_count=result["usage_count"],
            last_used=result["last_used"],
            is_confirmed=result["is_confirmed"],
        )
        for result in results
    ]

    return suggestions

@router.post("/parts/record")
async def record_part_usage(request: PartRecordRequest, db: Session = Depends(get_db)):
    """
    부품명 사용 이력 기록 (학습)
    - 사용자가 선택한 부품명을 DB에 저장
    """
    input_text = request.input_text or request.part_name

    # 사용 이력 기록
    crud.record_part_usage(db, request.part_name, input_text)

    # 별칭 매핑 생성/업데이트
    if input_text != request.part_name:
        crud.create_or_update_mapping(db, input_text, request.part_name)

    return {"message": "Part usage recorded", "part_name": request.part_name}

@router.get("/parts/mappings", response_model=List[PartMappingInfo])
async def list_part_mappings(db: Session = Depends(get_db)):
    """
    부품명 및 별칭 매핑 현황 조회
    """
    parts = crud.get_all_parts(db, limit=10000)
    mappings = crud.get_all_mappings(db)

    part_lookup: dict[int, PartMappingInfo] = {}
    for part in parts:
        usage_count = len(part.usage_history)
        part_lookup[part.id] = PartMappingInfo(
            part_id=part.id,
            name=part.name,
            description=part.description,
            is_confirmed=part.is_confirmed,
            confirmed_at=part.confirmed_at.isoformat() if part.confirmed_at else None,
            usage_count=usage_count,
            aliases=[]
        )

    for mapping in mappings:
        entry = part_lookup.get(mapping.part_id)
        if entry is None:
            part = crud.get_part_by_id(db, mapping.part_id)
            if not part:
                continue
            entry = PartMappingInfo(
                part_id=part.id,
                name=part.name,
                description=part.description,
                is_confirmed=part.is_confirmed,
                confirmed_at=part.confirmed_at.isoformat() if part.confirmed_at else None,
                usage_count=len(part.usage_history),
                aliases=[]
            )
            part_lookup[part.id] = entry

        entry.aliases.append(
            PartAliasInfo(
                mapping_id=mapping.id,
                alias=mapping.alias,
                confidence_score=mapping.confidence_score or 0.0,
                usage_count=mapping.usage_count or 0,
                last_used=mapping.last_used.isoformat() if mapping.last_used else None,
            )
        )

    for entry in part_lookup.values():
        entry.aliases.sort(
            key=lambda alias: (alias.usage_count, alias.confidence_score, alias.alias),
            reverse=True,
        )

    # 사용량 많은 순으로 정렬, 별칭 없는 경우도 포함
    result = sorted(
        part_lookup.values(),
        key=lambda item: (item.usage_count, len(item.aliases), item.name),
        reverse=True,
    )

    return result


@router.post("/parts")
async def create_part(request: CreatePartRequest, db: Session = Depends(get_db)):
    """
    정식 부품명 추가
    """
    try:
        part = crud.create_part(
            db,
            request.name,
            request.description,
            bool(request.is_confirmed),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    part_info = PartMappingInfo(
        part_id=part.id,
        name=part.name,
        description=part.description,
        is_confirmed=part.is_confirmed,
        confirmed_at=part.confirmed_at.isoformat() if part.confirmed_at else None,
        usage_count=len(part.usage_history),
        aliases=[],
    )

    return {
        "message": "정식 부품명을 추가했습니다.",
        "part": part_info,
    }


@router.put("/parts/{part_id}")
async def update_part(part_id: int, request: UpdatePartRequest, db: Session = Depends(get_db)):
    """
    정식 부품명 정보 수정
    """
    try:
        part = crud.update_part(
            db,
            part_id,
            request.name,
            request.description,
            request.is_confirmed,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not part:
        raise HTTPException(status_code=404, detail="정식 부품명을 찾을 수 없습니다.")

    return {"message": "정식 부품명이 수정되었습니다.", "part_id": part.id}

@router.post("/parts/{part_id}/merge")
async def merge_part(part_id: int, request: MergePartRequest, db: Session = Depends(get_db)):
    """
    정식 부품명 병합 (해당 부품을 다른 부품으로 병합)
    """
    target_part_id = request.target_part_id

    if target_part_id is None:
        if request.target_part_name:
            target_name = request.target_part_name.strip()
            if not target_name:
                raise HTTPException(status_code=400, detail="병합 대상 부품명을 입력해주세요.")
            target_part = crud.get_or_create_part(db, target_name)
            target_part_id = target_part.id
        else:
            raise HTTPException(status_code=400, detail="병합 대상 부품을 선택하거나 입력해주세요.")

    try:
        target = crud.merge_parts(db, part_id, target_part_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "message": "정식 부품명이 병합되었습니다.",
        "target_part_id": target.id,
        "target_part_name": target.name,
    }

@router.delete("/parts/{part_id}")
async def delete_part(part_id: int, db: Session = Depends(get_db)):
    """
    정식 부품명 삭제
    """
    try:
        crud.delete_part(db, part_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {"message": "정식 부품명이 삭제되었습니다.", "part_id": part_id}

@router.post("/parts/{part_id}/aliases")
async def create_alias(part_id: int, request: CreateAliasRequest, db: Session = Depends(get_db)):
    """
    별칭 추가
    """
    try:
        mapping = crud.create_alias(db, part_id, request.alias, request.confidence_score)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {
        "message": "별칭이 추가되었습니다.",
        "mapping": {
            "mapping_id": mapping.id,
            "alias": mapping.alias,
            "confidence_score": mapping.confidence_score,
            "usage_count": mapping.usage_count,
            "last_used": mapping.last_used.isoformat() if mapping.last_used else None,
        },
    }

@router.put("/parts/{part_id}/aliases/{mapping_id}")
async def update_alias(part_id: int, mapping_id: int, request: UpdateAliasRequest, db: Session = Depends(get_db)):
    """
    별칭 수정
    """
    if request.alias is None and request.confidence_score is None:
        raise HTTPException(status_code=400, detail="수정할 항목을 지정해주세요.")

    try:
        mapping = crud.update_alias(db, mapping_id, alias=request.alias, confidence_score=request.confidence_score)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if mapping.part_id != part_id:
        raise HTTPException(status_code=400, detail="요청한 부품과 별칭이 일치하지 않습니다.")

    return {
        "message": "별칭이 수정되었습니다.",
        "mapping": {
            "mapping_id": mapping.id,
            "alias": mapping.alias,
            "confidence_score": mapping.confidence_score,
            "usage_count": mapping.usage_count,
            "last_used": mapping.last_used.isoformat() if mapping.last_used else None,
        },
    }

@router.delete("/parts/{part_id}/aliases/{mapping_id}")
async def delete_alias(part_id: int, mapping_id: int, db: Session = Depends(get_db)):
    """
    별칭 삭제
    """
    mapping = crud.get_mapping_by_id(db, mapping_id)
    if not mapping:
        raise HTTPException(status_code=404, detail="별칭을 찾을 수 없습니다.")

    if mapping.part_id != part_id:
        raise HTTPException(status_code=400, detail="요청한 부품과 별칭이 일치하지 않습니다.")

    try:
        crud.delete_alias(db, mapping_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return {"message": "별칭이 삭제되었습니다."}

@router.post("/excel/upload")
async def upload_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    엑셀 파일 업로드 및 파싱
    - 거래명세서 엑셀 파일을 파싱하여 데이터 추출
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="엑셀 파일만 업로드 가능합니다")

    # 임시 파일 저장
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    temp_path = settings.UPLOAD_DIR / f"{timestamp}_{file.filename}"

    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        # 엑셀 파싱
        with ExcelParser(temp_path) as parser:
            parser.load()

            # 품목 데이터 추출 (14행부터 시작, A열이 품목명)
            items = parser.extract_items(
                start_row=14,
                item_name_col=1,  # A열
                quantity_col=None,  # 필요시 추가
                unit_price_col=None  # 필요시 추가
            )

            return {
                "filename": file.filename,
                "status": "success",
                "items_count": len(items),
                "items": items
            }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"엑셀 파싱 실패: {str(e)}")
    finally:
        # 임시 파일 삭제
        if temp_path.exists():
            temp_path.unlink()

@router.post("/excel/generate")
async def generate_excel(request: GenerateExcelRequest):
    """
    거래명세서 엑셀 파일 생성 및 다운로드
    - 선택된 부품 목록으로 거래명세서 엑셀 파일 생성
    """
    # 템플릿 파일 확인
    if not settings.TEMPLATE_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"템플릿 파일을 찾을 수 없습니다: {settings.TEMPLATE_PATH}"
        )

    # 출력 파일명 생성 (타임스탬프 포함)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_filename = f"거래명세서_{timestamp}.xlsx"
    output_path = settings.UPLOAD_DIR / output_filename

    try:
        # 날짜 파싱 (YYYY-MM-DD 형식 -> datetime)
        invoice_date = datetime.now()
        if request.invoice_date:
            try:
                invoice_date = datetime.strptime(request.invoice_date, "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="날짜 형식이 올바르지 않습니다. YYYY-MM-DD 형식으로 입력해주세요.")

        # 부품 아이템을 딕셔너리 리스트로 변환
        items_data = [item.model_dump() for item in request.items]

        # 엑셀 생성
        generator = ExcelGenerator(settings.TEMPLATE_PATH)
        generator.generate(
            output_path=output_path,
            items=items_data,
            date=invoice_date,
            vehicle_number=request.vehicle_number,
        )

        # 파일 읽기
        def iter_file():
            with output_path.open("rb") as file:
                yield from file

        # 파일 스트리밍 응답 (한글 파일명 URL 인코딩)
        encoded_filename = quote(output_filename)
        response = StreamingResponse(
            iter_file(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            }
        )

        return response

    except FileNotFoundError as e:
        # 템플릿 파일을 찾을 수 없는 경우
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"템플릿 파일 오류: {str(e)}", exc_info=True)
        if output_path.exists():
            output_path.unlink()
        raise HTTPException(status_code=500, detail=f"템플릿 파일 오류: {str(e)}")
    except Exception as e:
        # 기타 에러
        import logging
        import traceback
        logger = logging.getLogger(__name__)
        logger.error(f"엑셀 생성 실패: {str(e)}", exc_info=True)
        logger.error(f"상세 트레이스: {traceback.format_exc()}")
        # 에러 발생 시 임시 파일 삭제
        if output_path.exists():
            output_path.unlink()
        raise HTTPException(status_code=500, detail=f"엑셀 생성 실패: {str(e)}")
    finally:
        # 응답 후 파일 삭제는 백그라운드에서 처리
        # (StreamingResponse가 완료된 후 삭제되어야 하므로 여기서는 삭제하지 않음)
        pass
