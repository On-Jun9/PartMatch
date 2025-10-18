"""
데이터베이스 초기화 및 샘플 데이터 생성 스크립트
"""
from . import init_db, SessionLocal
from . import crud

def initialize_database():
    """데이터베이스 테이블 생성"""
    print("데이터베이스 초기화 중...")
    init_db()
    print("✓ 테이블 생성 완료")

def seed_sample_data():
    """샘플 데이터 삽입"""
    db = SessionLocal()

    try:
        print("\n샘플 데이터 생성 중...")

        # 샘플 부품명들
        sample_parts = [
            ("스테인리스 파이프 304 50A", "304 스테인리스 파이프 50A"),
            ("PVC 배관 25mm", "PVC 파이프 25mm"),
            ("게이트 밸브 3인치", "게이트밸브 3\""),
            ("볼밸브 1인치 SUS304", "스테인리스 볼밸브 1\""),
            ("엘보 90도 40A", "엘보 90° 40A"),
        ]

        for formal_name, alias in sample_parts:
            # 정식 부품명 생성
            part = crud.get_or_create_part(db, formal_name)
            print(f"  ✓ 부품 생성: {formal_name}")

            # 별칭 매핑 생성
            if alias != formal_name:
                crud.create_or_update_mapping(db, alias, formal_name)
                print(f"    - 별칭 매핑: '{alias}' -> '{formal_name}'")

            # 사용 이력 기록
            crud.record_part_usage(db, formal_name, alias)

        print("\n✓ 샘플 데이터 생성 완료")

    finally:
        db.close()

if __name__ == "__main__":
    initialize_database()
    seed_sample_data()
    print("\n데이터베이스 초기화가 완료되었습니다.")
