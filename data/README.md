# Data

공식 농업/원예 자료를 수집, 정규화, 청킹, 임베딩하여 Supabase pgvector에 적재하는 영역입니다.

## 핵심 원칙

- 원본 HTML, API 응답, 이미지, embedding 포함 파일은 Git에 커밋하지 않습니다.
- 모든 RAG chunk는 출처와 citation metadata를 가져야 합니다.
- 병해충/농약 관련 데이터는 확정 진단이나 직접 처방으로 사용하지 않습니다.
- Backend가 읽는 최종 구조는 Supabase `rag_sources`, `rag_chunks` 테이블 기준입니다.

## 우선순위

1. `indoor_care`: 농사로 실내식물 관리 자료
2. `crop_care`: 농사로 작목정보, 토마토/고추/상추/오이/딸기
3. `pest_reference`: NCPMS 병해충 참고 자료
4. `pesticide_safety`: PSIS 농약 안전사용기준 참고
5. `image_reference`: AI Hub 이미지 manifest
6. `weather_context`: 농업날씨365, 2차 확장

## 주요 문서

- [PIPELINE.md](PIPELINE.md): 전체 데이터 파이프라인
- [source_registry.json](catalog/source_registry.json): 공식 출처와 API key 필요 여부
- [category_taxonomy.json](catalog/category_taxonomy.json): 카테고리와 symptom keyword
- [scripts/README.md](scripts/README.md): 실행 명령

## 빠른 실행

```bash
python data/scripts/run_pipeline.py --collect-web
```

OpenAI embedding과 Supabase 적재까지 진행:

```bash
python data/scripts/run_pipeline.py --collect-web --embed --embed-mode openai --load-supabase --replace
```

필요 환경변수:

- `OPENAI_API_KEY`
- `EMBEDDING_MODEL=text-embedding-3-small`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PSIS_API_KEY` if PSIS API collection is needed
- `NCPMS_API_KEY` if approved NCPMS API collection is used

## 산출물

```text
data/raw/         # 원본 저장, Git 금지
data/interim/     # 중간 결과, Git 금지
data/processed/   # RAG chunk/source 후보, 기본 Git 금지
data/vectorstore/ # embedding 포함 결과, Git 금지
```

Backend 적재 대상:

- `data/processed/rag_sources.sample.jsonl`
- `data/processed/rag_chunks.sample.jsonl`
- `data/vectorstore/rag_chunks.embedded.jsonl`
