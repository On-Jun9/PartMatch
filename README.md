# PartMatch - 부품명 학습형 거래명세서 관리 시스템

작업자들이 말하는 부품명과 정식 명칭의 차이를 학습하여 자동으로 추천해주는 웹 기반 거래명세서 관리 시스템입니다.

## 주요 기능

- **스마트 부품명 입력**: 유사한 부품명 실시간 자동완성
- **학습 기능**: 사용 이력 기반 부품명 추천 및 매핑
- **Excel 처리**: 템플릿 기반 거래명세서 작성·다운로드, 엑셀 파싱 API
- **미리보기·인쇄**: 템플릿 서식과 인쇄 설정을 사용하는 읽기 전용 미리보기
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

### 거래명세서 출력
- 날짜·차량번호·규격·수량·단가·공급가액을 입력하고 미리보기에서 인쇄하거나 엑셀 파일을 다운로드합니다.
- 미리보기와 인쇄는 동일한 SVG를 사용하며, 생성된 파일에 포함된 템플릿의 셀 서식·인쇄 영역·용지·여백·배율·한 페이지 맞춤 설정을 따릅니다. 인쇄 영역의 빈 행·열도 포함하고 영역 밖 내용은 출력하지 않습니다. 다운로드 파일의 세액·합계 수식은 유지합니다.
- 현재 입력 위치는 14~37행의 기존 양식에 맞춰져 있고, 품목은 1~24개까지 지원합니다. 임의의 다른 양식으로 교체하면 입력 위치도 별도 수정해야 합니다.
- 단일 인쇄 영역·한 페이지 양식을 지원합니다. 템플릿에 인쇄 영역이 없거나 여러 개이면 미리보기에 오류를 표시합니다. 미리보기 수식 계산은 셀 참조·곱셈·덧셈·`SUM` 범위에 한정됩니다. 지원하지 않는 수식이나 페이지 설정도 오류를 표시하며 엑셀 다운로드는 가능합니다.
- 템플릿의 돋움·굴림을 재현하려면 사용 권한이 있는 웹 글꼴을 `data/fonts/dotum.woff2`, `data/fonts/gulim.woff2`에 배치합니다. 이 로컬 파일들은 Git에서 제외되므로 다른 PC나 서버에도 별도로 공급해야 합니다. Docker에서는 기존 `data` 볼륨을 통해 읽습니다. 글꼴이 없으면 대체 글꼴 경고를 표시합니다.
- 브라우저 출력은 글꼴과 렌더링 방식의 영향을 받으므로 Excel 출력과 픽셀 단위 동일성을 보장하지 않습니다. 실제 프린터 출력은 별도 확인이 필요합니다.

### 🚧 개발 예정
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
