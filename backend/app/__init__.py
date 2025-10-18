from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import routes
from .db import init_db

def create_app() -> FastAPI:
    # 데이터베이스 초기화
    init_db()

    app = FastAPI(
        title="PartMatch API",
        description="부품명 학습형 거래명세서 관리 시스템",
        version="1.0.0"
    )

    # CORS 설정
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # 모든 origin 허용 (로컬 네트워크 전용)
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # 라우터 등록
    app.include_router(routes.router, prefix="/api")

    return app
