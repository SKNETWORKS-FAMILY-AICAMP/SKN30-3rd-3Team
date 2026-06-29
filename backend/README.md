# Backend

FastAPI 기반 API 서버와 LangGraph/RAG 실행 영역입니다.

## 권장 스택

- Python 3.11+
- FastAPI
- Pydantic
- SQLAlchemy 또는 Supabase Python client
- LangGraph + LangChain
- pgvector
- pytest

## 예정 구조

```text
backend/
├── app/
│   ├── main.py
│   ├── api/
│   ├── auth/
│   ├── core/
│   ├── db/
│   ├── rag/
│   ├── graphs/
│   └── schemas/
├── migrations/
└── tests/
```

## 핵심 API

- `GET /health`
- `GET /api/v1/plants`
- `POST /api/v1/plants`
- `POST /api/v1/plants/{plantId}/care-logs`
- `POST /api/v1/plants/{plantId}/photos`
- `POST /api/v1/chat/plant-care`

상세 계약은 `contracts/api/openapi.yaml`을 기준으로 합니다.

## LangGraph MVP

1. 입력 검증
2. 이미지 이상 신호 추출
3. 사용자 식물/재배일지 맥락 요약
4. RAG 검색 query 생성
5. 공식 문서 검색
6. 답변 생성
7. 안전성 검토
8. 상담 이력 저장

## 배포

- MVP는 Render 또는 Railway를 추천합니다.
- Docker 기반 배포가 필요하면 `server/`의 설정을 사용합니다.
- `/health` endpoint는 배포 health check로 사용합니다.
