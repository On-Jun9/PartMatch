"""
엑셀 품목명을 읽어 정식 부품명과의 매핑을 자동으로 갱신하는 스크립트.

사용 방법:
    python backend/scripts/import_excel_parts.py --excel "samples/거래명세서_샘플.xlsx"
"""
from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List

import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.app.db import SessionLocal, crud
from backend.app.excel.parser import ExcelParser
from backend.app.ml.fuzzy_matcher import fuzzy_matcher


EXCLUDE_TOKENS = {"품  목  명", "계"}


@dataclass
class ProcessResult:
    alias: str
    part_name: str
    occurrences: int
    confidence: float
    mapping_status: str
    part_created: bool


def iter_item_names(parser: ExcelParser) -> Iterable[str]:
    """시트에서 유효한 품목명만 추출"""
    parser.load()
    sheet = parser.sheet
    if sheet is None:
        return []

    for row in range(1, sheet.max_row + 1):
        value = sheet.cell(row=row, column=1).value
        if value is None:
            continue

        text = str(value).strip()
        if not text:
            continue
        if text in EXCLUDE_TOKENS:
            continue
        if text.startswith("※"):
            continue

        yield text


def resolve_part_name(db, alias: str) -> tuple[str, float]:
    """
    엑셀에서 읽은 별칭을 가장 근접한 정식 명칭으로 매핑.
    매칭된 부품이 없으면 그대로 정식 명칭으로 사용.
    """
    matches = fuzzy_matcher.search_parts_in_db(alias, db, limit=1)
    if not matches:
        return alias, 1.0

    best = matches[0]
    return best["name"], float(best["score"])


def process_alias(db, alias: str, occurrences: int) -> ProcessResult:
    """하나의 별칭에 대해 매핑과 사용 이력을 반영"""
    target_name, confidence = resolve_part_name(db, alias)

    existing_part = crud.get_part_by_name(db, target_name)
    part_created = existing_part is None
    part = crud.get_or_create_part(db, target_name)

    mapping_status = "skipped"
    if alias != part.name:
        existing_mapping = crud.get_mapping_by_alias(db, alias)
        mapping = crud.create_or_update_mapping(db, alias, part.name, confidence_score=confidence)

        if occurrences > 1:
            mapping.usage_count += occurrences - 1
            db.commit()

        mapping_status = "updated" if existing_mapping else "created"

    # 사용 이력 기록 (발견된 횟수만큼)
    for _ in range(occurrences):
        crud.record_part_usage(db, part.name, alias)

    return ProcessResult(
        alias=alias,
        part_name=part.name,
        occurrences=occurrences,
        confidence=confidence,
        mapping_status=mapping_status,
        part_created=part_created,
    )


def run(excel_path: Path) -> List[ProcessResult]:
    parser = ExcelParser(excel_path)
    with SessionLocal() as db:
        items = list(iter_item_names(parser))
        counts = Counter(items)

        results: List[ProcessResult] = []
        for alias, occurrences in counts.items():
            results.append(process_alias(db, alias, occurrences))

    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="엑셀 품목명 기반 매핑 업데이트 도구")
    parser.add_argument("--excel", type=Path, default=None, help="처리할 엑셀 파일 경로")
    args = parser.parse_args()

    if args.excel:
        excel_path = args.excel
    else:
        candidates = [
            p for p in Path(".").glob("*.xlsx") if not p.name.startswith("~$")
        ]
        if not candidates:
            raise FileNotFoundError("현재 디렉터리에서 처리할 엑셀 파일을 찾지 못했습니다.")
        if len(candidates) > 1:
            raise FileNotFoundError(
                "엑셀 파일이 여러 개 발견되었습니다. --excel 옵션으로 파일을 지정하세요."
            )
        excel_path = candidates[0]

    if not excel_path.exists():
        raise FileNotFoundError(f"엑셀 파일을 찾을 수 없습니다: {excel_path}")

    results = run(excel_path)

    created_parts = sum(1 for r in results if r.part_created)
    created_mappings = sum(1 for r in results if r.mapping_status == "created")
    updated_mappings = sum(1 for r in results if r.mapping_status == "updated")

    print("=== Excel Import Summary ===")
    print(f"엑셀 파일: {excel_path}")
    print(f"총 품목 수: {sum(r.occurrences for r in results)} (고유 {len(results)}개)")
    print(f"신규 부품: {created_parts}")
    print(f"신규 매핑: {created_mappings}")
    print(f"업데이트된 매핑: {updated_mappings}")
    print()
    for r in results:
        print(
            f"- '{r.alias}' -> '{r.part_name}' "
            f"(횟수: {r.occurrences}, 신뢰도: {r.confidence:.2f}, 매핑: {r.mapping_status})"
        )


if __name__ == "__main__":
    main()
