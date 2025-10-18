"""
기존 엑셀 파일에서 부품명 추출하여 샘플 데이터 생성
"""
import sys
from pathlib import Path

# 프로젝트 루트를 Python path에 추가
sys.path.insert(0, str(Path(__file__).parent))

from openpyxl import load_workbook
from app.db import SessionLocal, init_db
from app.db import crud

def extract_parts_from_excel(file_path: str):
    """엑셀 파일의 모든 시트에서 부품명 추출"""
    workbook = load_workbook(file_path, data_only=True)

    all_parts = set()  # 중복 제거를 위해 set 사용

    print(f"   총 {len(workbook.worksheets)}개 시트 발견")

    # 모든 시트를 순회
    for sheet_idx, sheet in enumerate(workbook.worksheets, 1):
        print(f"   [{sheet_idx}/{len(workbook.worksheets)}] {sheet.title} 읽는 중...")

        # 14행부터 시작 (엑셀 구조 기반)
        for row in range(14, min(sheet.max_row + 1, 50)):  # 최대 50행까지
            cell_value = sheet.cell(row=row, column=1).value  # A열
            if cell_value and str(cell_value).strip():
                part_name = str(cell_value).strip()
                # 빈 값이나 너무 짧은 값, 제외 키워드
                exclude_keywords = ['합계', '총계', '비고', '계', '※', '품  목  명']
                if (len(part_name) > 1 and
                    part_name not in exclude_keywords and
                    not part_name.startswith('※')):
                    all_parts.add(part_name)

    workbook.close()
    return list(all_parts)

def create_sample_data():
    """샘플 데이터 생성"""
    print("=" * 60)
    print("부품명 샘플 데이터 생성 시작")
    print("=" * 60)

    # 데이터베이스 초기화
    print("\n1. 데이터베이스 테이블 생성...")
    init_db()
    print("   ✓ 완료")

    # 엑셀 파일에서 부품명 추출
    excel_path = Path(__file__).parent.parent / "samples" / "거래명세서_샘플.xlsx"
    print(f"\n2. 엑셀 파일 읽기: {excel_path.name}")

    if not excel_path.exists():
        print(f"   ✗ 엑셀 파일을 찾을 수 없습니다: {excel_path}")
        return

    parts = extract_parts_from_excel(str(excel_path))
    print(f"   ✓ {len(parts)}개의 부품명 추출")
    print(f"   - 추출된 부품: {', '.join(parts[:10])}{'...' if len(parts) > 10 else ''}")

    # DB에 저장
    db = SessionLocal()

    try:
        print("\n3. 데이터베이스에 저장 중...")

        # 정식 부품명으로 저장
        for part_name in parts:
            # 부품 생성 또는 조회
            part = crud.get_or_create_part(db, part_name)

            # 사용 이력 기록
            crud.record_part_usage(db, part_name, part_name)
            print(f"   ✓ {part_name}")

        print(f"\n   총 {len(parts)}개 부품 저장 완료")

        # 추가 일반 부품명 데이터
        print("\n4. 일반 부품명 추가 중...")

        common_parts = [
            # 자동차 부품
            "브레이크 패드",
            "브레이크 디스크",
            "에어컨 필터",
            "와이퍼 블레이드",
            "타이밍 벨트",
            "점화플러그",
            "배터리",
            "라디에이터",
            "머플러",
            "쇼바",
            # 오일/소모품
            "미션오일",
            "브레이크오일",
            "파워스티어링 오일",
            "워셔액",
            # 필터류
            "오일 필터",
            "에어 필터",
            "연료 필터",
            # 전기 부품
            "배터리",
            "발전기",
            "스타터 모터",
            "퓨즈",
            # 기타
            "타이어",
            "휠",
            "범퍼",
            "본넷",
            "헤드라이트",
            "후미등",
        ]

        for part_name in common_parts:
            part = crud.get_or_create_part(db, part_name)
            crud.record_part_usage(db, part_name, part_name)
            print(f"   ✓ {part_name}")

        # 별칭 데이터 추가 (들리는대로 쓴 예시)
        print("\n5. 별칭 매핑 데이터 추가 중...")

        aliases = {
            # 엑셀에서 추출한 부품
            "엔진오일 24": ["엔진유", "엔진기름", "오일24", "엔진오일", "엔진유24"],
            "부동액": ["부동엑", "냉각수", "냉갹수", "부동애"],
            "벨트": ["밸트", "구동벨트", "벨트"],
            "엔진": ["엔진", "엔진블럭", "엔진본체", "엔진블록"],
            "첸지레바케이블": ["체인지레버케이블", "기어케이블", "체인지케이블", "체인지레바케이블"],
            "탁송비": ["탁송료", "배송비", "운송비"],

            # 추가 부품 별칭
            "브레이크 패드": ["브레이크패드", "브레이크팟", "브패드", "패드"],
            "브레이크 디스크": ["브레이크디스크", "디스크", "브디스크"],
            "에어컨 필터": ["에어컨필터", "에어컨휠터", "에콘필터", "에컨필터", "에어콘필터"],
            "와이퍼 블레이드": ["와이퍼", "와이파", "와이퍼블레이드", "와이퍼날"],
            "타이밍 벨트": ["타이밍벨트", "타이밍밸트", "타밍벨트"],
            "점화플러그": ["점화플러그", "점화플럭", "플러그", "스파크플러그"],
            "배터리": ["밧데리", "밧테리", "베터리", "베테리"],
            "라디에이터": ["라지에이터", "라디에타", "라지에타"],
            "머플러": ["머플러", "머플라", "배기관"],
            "쇼바": ["쇼바", "쇽업쇼바", "쇼크업소바"],

            "미션오일": ["미션유", "미션기름", "변속기오일"],
            "브레이크오일": ["브레이크유", "브레이크액", "브유"],
            "파워스티어링 오일": ["파워오일", "파오", "파워핸들오일"],
            "워셔액": ["워셔액", "워샤액", "세척액"],

            "오일 필터": ["오일필터", "오일휠터", "오휠"],
            "에어 필터": ["에어필터", "에어휠터", "공기필터"],
            "연료 필터": ["연료필터", "퓨얼필터", "기름필터"],

            "발전기": ["발전기", "알터네이터", "올터네이터"],
            "스타터 모터": ["스타터", "시동모터", "스타터모터"],
            "퓨즈": ["휴즈", "퓨우즈"],

            "타이어": ["타이어", "타이아", "타야"],
            "휠": ["휠", "알루미늄휠", "알휠"],
            "범퍼": ["범퍼", "범빠", "봄퍼"],
            "본넷": ["본넷", "본네트", "보넷"],
            "헤드라이트": ["헤드라이트", "헤드라잍", "전조등", "전조"],
            "후미등": ["후미등", "후방등", "테일램프", "테일등"],
        }

        for formal_name, alias_list in aliases.items():
            # 정식 명칭이 DB에 있는지 확인
            part = crud.get_part_by_name(db, formal_name)
            if part:
                for alias in alias_list:
                    crud.create_or_update_mapping(db, alias, formal_name, confidence_score=0.9)
                    print(f"   ✓ '{alias}' → '{formal_name}'")

        print("\n6. 샘플 데이터 생성 완료!")
        print("=" * 60)

        # 통계 출력
        print("\n📊 데이터베이스 통계:")
        all_parts = crud.get_all_parts(db)
        all_mappings = crud.get_all_mappings(db)
        print(f"   - 총 부품 수: {len(all_parts)}개")
        print(f"   - 별칭 매핑: {len(all_mappings)}개")

        print("\n✅ 이제 웹에서 부품명을 검색하면 자동완성이 작동합니다!")
        print("   예시: '엔진', '부동', '벨' 등을 입력해보세요.\n")

    except Exception as e:
        print(f"\n✗ 오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    create_sample_data()
