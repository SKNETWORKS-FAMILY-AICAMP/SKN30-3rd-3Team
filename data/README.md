# Data

공식 원예/농업 자료를 수집, 정제, 청킹해 RAG에 사용할 수 있는 형태로 만드는 영역입니다.

## 1차 MVP 데이터 우선순위

1. 농사로 실내식물 물관리 자료
2. 국립원예특작과학원 실내정원 유지관리 자료
3. 농촌진흥청 작목별 농업기술정보
4. 주간농사정보 OpenAPI
5. 도시농업 병해충 관리 자료
6. AI Hub 시설/노지 작물 질병 이미지 일부

## 폴더 용도

```text
data/
├── catalog/       # 출처, 라이선스, schema, 수집 로그
├── scripts/       # 수집/전처리/청킹 script
├── notebooks/     # 탐색용 notebook
├── raw/           # 원본 데이터, Git 커밋 금지
├── external/      # 외부 대용량 데이터, Git 커밋 금지
├── interim/       # 중간 산출물, Git 커밋 금지
├── processed/     # 처리 산출물, 작은 샘플만 커밋 가능
└── vectorstore/   # local vector DB, Git 커밋 금지
```

## RAG chunk 생성 기준

- chunk는 원문 출처를 추적할 수 있어야 합니다.
- 제목/기관/URL/수집일/카테고리/작물명/증상 키워드를 metadata로 포함합니다.
- 실내식물 기본 관리 자료와 작목별 기술정보를 우선 인덱싱합니다.
- 병해충/농약 자료는 안전 주의 태그를 포함합니다.

## 데이터 보관 정책

- 원본 파일은 Git이 아니라 Supabase Storage, Cloudflare R2, 공유 드라이브 중 하나에 둡니다.
- Git에는 source catalog, script, schema, 작은 샘플만 둡니다.
- 수집 날짜와 출처 URL을 누락하지 않습니다.
