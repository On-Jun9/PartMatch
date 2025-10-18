from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # 프로젝트 루트
    PROJECT_ROOT: Path = Path(__file__).parent.parent

    # 데이터베이스
    @property
    def DATABASE_URL(self) -> str:
        db_path = self.PROJECT_ROOT / "data" / "partmatch.db"
        return f"sqlite:///{db_path}"

    # 업로드 설정
    UPLOAD_DIR: Path = PROJECT_ROOT / "data" / "uploads"
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024  # 10MB

    # 엑셀 템플릿 설정
    TEMPLATE_PATH: Path = PROJECT_ROOT / "거래명세서_템플릿.xlsx"

    # 유사도 검색 설정
    FUZZY_MATCH_THRESHOLD: int = 70  # 0-100
    MAX_SUGGESTIONS: int = 10

    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# 필요한 디렉토리 생성
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
