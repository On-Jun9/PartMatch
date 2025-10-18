from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from ..config import settings

# 데이터베이스 엔진 생성
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite용
)

# 세션 팩토리
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base 클래스
Base = declarative_base()

def ensure_schema():
    """필요한 스키마 변경 사항을 적용"""
    with engine.begin() as connection:
        tables = {
            row[0]
            for row in connection.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
        }
        if "parts" not in tables:
            return

        part_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(parts)"))
        }
        added_is_confirmed = False
        if "is_confirmed" not in part_columns:
            connection.execute(
                text("ALTER TABLE parts ADD COLUMN is_confirmed BOOLEAN DEFAULT 0")
            )
            added_is_confirmed = True
        if "confirmed_at" not in part_columns:
            connection.execute(
                text("ALTER TABLE parts ADD COLUMN confirmed_at DATETIME")
            )
        if "is_confirmed" in part_columns or added_is_confirmed:
            connection.execute(
                text("UPDATE parts SET is_confirmed = 0 WHERE is_confirmed IS NULL")
            )

def get_db():
    """데이터베이스 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """데이터베이스 초기화 (테이블 생성)"""
    from . import models  # noqa
    Base.metadata.create_all(bind=engine)
    ensure_schema()

ensure_schema()
