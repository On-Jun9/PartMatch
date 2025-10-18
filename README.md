# PartMatch - 부품명 학습형 거래명세서 관리 시스템

작업자들이 말하는 부품명과 정식 명칭의 차이를 학습하여 자동으로 추천해주는 웹 기반 거래명세서 관리 시스템입니다.

## 주요 기능

- **스마트 부품명 입력**: 유사한 부품명 실시간 자동완성
- **학습 기능**: 사용 이력 기반 부품명 추천 및 매핑
- **Excel 처리**: 기존 엑셀 양식 업로드, 편집, 다운로드
- **인쇄 지원**: 엑셀 양식 그대로 인쇄 가능
- **명칭 관리 대시보드**: 등록된 정식 부품명과 별칭, 사용 빈도를 한눈에 확인

## 기술 스택

### Backend
- FastAPI (Python)
- SQLAlchemy + SQLite
- RapidFuzz (유사도 매칭)
- openpyxl (Excel 처리)

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- TanStack Query
- SheetJS (xlsx)

## 프로젝트 구조

```
PartMatch/
├── backend/           # FastAPI 백엔드
│   ├── app/
│   │   ├── api/       # REST API 엔드포인트
│   │   ├── ml/        # 유사도 검색 엔진
│   │   ├── db/        # 데이터베이스 모델
│   │   └── excel/     # Excel 파싱/생성
│   └── main.py
├── frontend/          # React 프론트엔드
│   └── src/
├── data/              # SQLite DB 및 업로드 파일
├── 거래명세서_템플릿.xlsx  # 엑셀 템플릿
└── 거래명세서_샘플.xlsx    # 샘플 데이터
```

## 시작하기

### 1. Backend 실행

```bash
# 의존성 설치
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 샘플 데이터 생성 (선택사항)
python app/db/init_db.py

# 서버 실행
python main.py
```

백엔드 서버가 `http://localhost:8000`에서 실행됩니다.
API 문서: `http://localhost:8000/docs`

### 2. Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드가 `http://localhost:5173`에서 실행됩니다.

## 주요 API 엔드포인트

- `POST /api/parts/search` - 부품명 유사도 검색
- `POST /api/parts/record` - 부품명 사용 이력 기록
- `POST /api/excel/upload` - 엑셀 파일 업로드 및 파싱
- `POST /api/excel/generate` - 거래명세서 엑셀 생성

## 구현 현황

### ✅ 완료된 기능
- [x] 프로젝트 구조 설계
- [x] Backend FastAPI 기본 구조
- [x] SQLite 데이터베이스 모델
- [x] RapidFuzz 유사도 검색 엔진
- [x] 엑셀 파일 파싱 API
- [x] Frontend React + TypeScript 설정
- [x] 부품명 자동완성 UI 컴포넌트
- [x] 학습 로직 (사용 이력 기반 추천)
- [x] 명칭 자동완성 현황 뷰 (정식 명칭/별칭/사용 이력 확인)
- [x] 데이터 정규화 스크립트 (`backend/scripts/normalize_parts.py`)

### 🛠️ 데이터 유지관리
- 거래명세서에서 신규 데이터를 반영한 후 `python backend/scripts/normalize_parts.py`를 실행해 중복된 부품명과 오탈자를 정식 명칭으로 정리하세요.
- 엔진오일 용량 표기, 히터/호스 오탈자, 써모스탯 관련 명칭이 자동으로 정규화되며 별칭 매핑과 사용 이력은 유지됩니다.

### 🚧 개발 예정
- [ ] 엑셀 파일 생성 및 다운로드
- [ ] 인쇄 기능 (CSS 기반)
- [ ] 거래명세서 전체 입력 폼
- [ ] 파일 업로드 UI

## 사용 방법

1. **부품명 입력**: 검색창에 부품명을 입력하면 유사한 부품명이 자동으로 추천됩니다
2. **학습 기능**: 선택한 부품명은 자동으로 학습되어 다음에 더 정확하게 추천됩니다
3. **유사도 점수**: 각 추천 항목에는 유사도 점수와 사용 빈도가 표시됩니다

## 데이터베이스 구조

- **Part**: 정식 부품명 마스터 테이블
- **PartMapping**: 비정식 명칭 → 정식 부품명 매핑
- **PartUsageHistory**: 부품명 사용 이력

## 문제 해결

### Backend 관련
- **포트 충돌**: 8000번 포트가 사용 중이면 `main.py`에서 포트 변경
- **모듈 오류**: `pip install -r requirements.txt` 다시 실행

### Frontend 관련
- **API 연결 오류**: Backend가 실행 중인지 확인
- **CORS 오류**: Backend의 CORS 설정 확인 (현재 localhost:5173 허용)
