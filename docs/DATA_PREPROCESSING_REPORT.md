# 데이터 전처리 결과서

## 1. 전처리 목적 

본 `Farm하니? / 식물 주치의 AI` 서비스의 데이터 전처리 작업은 전문 농업인을 위한 대규모 영농 의사결정 시스템이 아니라, 취미 또는 소규모로 식물을 기르는 사용자가 자신의 식물과 대화하듯 관리 상태를 확인하고, 물주기·빛·온도·병해충 의심 증상 등을 쉽게 이해할 수 있도록 돕는 식물 관리 AI 서비스를 목표로 수행되었다.

따라서 데이터는 전문 용어를 그대로 많이 축적하는 것보다, 사용자가 일상적으로 묻는 관리 질문에 답할 수 있는 형태로 정리하는 것을 우선했다. 예를 들어 “잎이 노래졌어요”, “물을 얼마나 줘야 하나요”, “햇빛을 많이 받아도 되나요”, “벌레가 생긴 것 같아요” 같은 질문에 대응할 수 있도록 식물명, 관리 환경, 증상 키워드, 안전 태그를 함께 구성했다.

이번 작업의 핵심은 단순히 많은 데이터를 한 번에 수집하는 것이 아니라, **출처와 안전 기준이 추적되는 식물 관리 RAG 데이터 파이프라인**을 만드는 데 있다. 따라서 모든 문서는 가능한 한 다음 metadata를 포함하도록 정리했다.

```text
source_id
source_key
title
publisher
url
license
collected_at
category
crop_or_plant
symptom_keywords
safety_tags
text
```

이 구조를 통해 Backend는 검색된 문서의 출처를 사용자에게 제시할 수 있고, 병해충이나 농약 관련 답변에서는 확정 진단이나 직접 처방처럼 보이는 표현을 피할 수 있다.

또한 식물명 검색과 실제 관리 답변은 성격이 다르기 때문에, 이번 전처리에서는 **식물 카탈로그 데이터와 RAG 근거 문서 데이터를 분리**했다.

식물 카탈로그는 다음 목적을 가진다.

```text
식물 검색
식물 등록
자동완성
alias 관리
기본 category 관리
```

RAG 문서는 다음 목적을 가진다.

```text
관리 질문 답변
출처 기반 근거 제공
증상/관리법 검색
citation 표시
```

이 분리는 향후 식물 수가 늘어났을 때도 중요하다. 어떤 식물은 검색/등록 대상에는 포함될 수 있지만, 아직 관리법 RAG 문서가 부족할 수 있다. 이 경우 “검색 가능한 식물”과 “근거 기반 답변이 가능한 식물”을 구분해서 관리할 수 있다.

이번 보고서에서는 이미지 임베딩 작업 흔적과 `weekly_farming_info` 항목은 제외한다.

---

## 2. 전체 데이터 구조

`data/` 폴더는 데이터 수집, 정규화, 청킹, 검증, 적재 준비를 담당하는 영역이다.

```text
data/
  catalog/       출처 registry, taxonomy, schema, 진행 상황 문서
  raw/           원본 HTML/API 응답/HWPX 등 원천 자료
  interim/       수집 후 정리된 중간 산출물
  processed/     RAG chunk, source, plant master 등 최종 전처리 산출물
  vectorstore/   embedding 포함 산출물
  scripts/       재현 가능한 수집/정규화/청킹/검증/적재 코드
  notebooks/     탐색, 검수, 보조 전처리 작업 노트북
```

각 폴더의 역할은 명확히 분리했다.

| 폴더 | 역할 |
|---|---|
| `catalog/` | 출처 정책, category taxonomy, schema, 작업 진행 상황 관리 |
| `raw/` | 원본 HTML, API 응답, HWPX, PDF 등 원천 자료 저장 |
| `interim/` | 수집 후 1차 정리된 JSON/JSONL/CSV 중간 산출물 |
| `processed/` | Backend/RAG 적재 전 최종 구조화 산출물 |
| `vectorstore/` | embedding 포함 파일 또는 pgvector 적재 준비 결과 |
| `scripts/` | 반복 실행 가능한 수집/전처리/검증 코드 |
| `notebooks/` | 실험, 수동 검수, 본문 품질 확인, 보조 전처리 |

특히 `catalog/source_registry.json`은 전체 구조의 중심이다. 각 출처의 제목, 발행기관, URL, 라이선스, category, 우선순위, API key 필요 여부, usage scope, safety tag를 관리한다. 출처 정책을 코드 내부에 흩어두지 않고 registry에 분리했기 때문에, 새 출처를 추가할 때 기존 파이프라인을 크게 바꾸지 않아도 된다.

---

## 3. 전체 파이프라인

전체 전처리 흐름은 다음과 같다.

```text
출처 등록
→ 원천 데이터 수집
→ 중간 문서 생성
→ 공통 RAG 문서 정규화
→ chunk 생성
→ source/chunk 검증
→ embedding 생성
→ Supabase pgvector 적재 준비
```

주요 코드 흐름은 다음과 같다.

| 단계 | 주요 코드 | 설명 |
|---|---|---|
| 출처 관리 | `source_registry.json` | 출처, 라이선스, category, safety tag 관리 |
| 웹/API 수집 | `collect_web_sources.py`, `collect_ncpms.py`, `collect_psis.py` | 농사로, NCPMS, PSIS 등 수집 |
| 식물 마스터 생성 | `build_plant_master.py` | 식물 검색/등록용 plant master 생성 |
| 문서 정규화 | `normalize_documents.py` | 여러 출처의 문서를 공통 RAG schema로 변환 |
| 청킹 | `chunk_documents.py` | 긴 문서를 검색 가능한 단위로 분할 |
| 검증 | `validate_processed_data.py` | 필수 필드, UUID, source 연결, safety tag 검증 |
| 커버리지 확인 | `validate_data_coverage.py` | 식물 카탈로그 대비 RAG 관리 문서 존재 여부 확인 |
| 임베딩 | `embed_chunks.py` | OpenAI 또는 hash mode embedding 생성 |
| 적재 | `load_supabase_pgvector.py`, `load_plant_catalog.py` | Supabase 적재 준비 |

공통 실행 진입점은 `run_pipeline.py`이다. 이 파일은 수집, 정규화, 청킹, 검증, 임베딩, Supabase 적재를 옵션 기반으로 연결한다.

예시 흐름은 다음과 같다.

```text
python data/scripts/run_pipeline.py --collect-web
python data/scripts/run_pipeline.py --collect-web --embed --embed-mode openai
python data/scripts/run_pipeline.py --build-plant-catalog --load-plant-catalog
```

---

## 4. 확장 가능성을 고려한 구조 설계

이번 구조는 특정 데이터셋에 맞춘 일회성 전처리가 아니라, 새 식물, 새 작물, 새 출처, 새 문서 유형이 들어와도 같은 흐름에 연결할 수 있도록 설계했다.

핵심 설계는 다음과 같다.

```text
출처 정책 분리
→ 수집 방식 분리
→ 중간 산출물 통일
→ 공통 RAG schema 정규화
→ source/chunk 분리
→ category와 usage_scope로 사용 범위 제어
→ safety_tags로 답변 안전성 제어
→ 검증 스크립트로 품질과 커버리지 확인
```

### 4.1 출처 정책 분리

출처 정보는 `source_registry.json`에 모았다.

이 파일에는 다음 정보가 들어간다.

```text
source_id
title
publisher
url
license
category
priority
collection_mode
api_key_env
usage_scope
safety_tags
notes
```

이렇게 설계한 이유는 출처가 늘어나도 코드 전체를 고치지 않고, registry에 출처 정책을 등록한 뒤 수집 결과만 공통 형식에 맞추면 되도록 하기 위해서다.

예를 들어 향후 다음 출처를 추가할 수 있다.

```text
국립수목원 식물도감
공공데이터포털 식물/기상 API
지역 농업기술원 보고서
관상식물/화훼 도감
```

새 출처 추가 절차는 다음과 같다.

```text
1. source_registry.json에 출처 추가
2. category와 usage_scope 지정
3. license와 safety_tags 기록
4. 수집 결과를 interim JSONL로 저장
5. 기존 normalize → chunk → validate → embed 흐름에 연결
```

### 4.2 수집 방식과 정규화 방식 분리

출처마다 수집 방식은 다르다.

```text
농사로 웹 페이지: HTML 수집
농사로 OpenAPI: XML 응답 수집
NCPMS: XML/JSON API 응답 수집
네이버 지식백과: API URL 후보 + Playwright 본문 수집
농작업 일정: HWPX 내부 XML 파싱
AI Hub: 라벨 ZIP 내부 JSON 파싱
```

하지만 수집 이후에는 모두 `data/interim/*.jsonl` 형태로 맞추고, 그 다음부터는 동일한 정규화/청킹/검증 흐름을 사용한다.

즉, 출처별 복잡성은 수집 단계에만 두고, 이후 파이프라인은 재사용 가능하도록 했다.

```text
출처에 따른 개별 수집기
→ JSONL 형식 처리
→ normalize_documents.py
→ chunk_documents.py
→ validate_processed_data.py
```

### 4.3 공통 RAG schema

모든 문서는 최종적으로 공통 RAG 문서 schema로 정규화된다.

```json
{
  "doc_id": "...",
  "source_id": "...",
  "source_key": "...",
  "title": "...",
  "publisher": "...",
  "url": "...",
  "license": "...",
  "collected_at": "...",
  "category": "...",
  "priority": 1,
  "usage_scope": "...",
  "section": "...",
  "crop_or_plant": [],
  "symptom_keywords": [],
  "safety_tags": [],
  "text": "..."
}
```

이 schema를 둔 이유는 다음과 같다.

- Backend가 출처와 본문을 일관된 방식으로 읽을 수 있다.
- Supabase `rag_sources`, `rag_chunks` 테이블 구조와 연결하기 쉽다.
- 출처 표시와 citation 생성이 가능하다.
- 식물명, 증상 키워드, category 기반 검색이 가능하다.
- 병해충/농약 관련 문서를 safety tag로 제어할 수 있다.
- 새 출처가 추가되어도 같은 필드만 채우면 기존 파이프라인에 연결할 수 있다.

### 4.4 `source_id`와 `source_key` 분리

전처리 구조에서는 사람이 읽는 출처 식별자와 DB 적재용 식별자를 분리했다.

```text
source_key: 사람이 읽기 쉬운 출처 key
source_id: Supabase 적재용 UUID
```

예시
```text
source_key = nongsaro_indoor_catalog
source_id  = UUID 문자열
```

이렇게 분리하면 사람이 로그와 문서를 읽을 때는 `source_key`로 이해하기 쉽고, DB에서는 UUID 기반으로 안정적으로 join할 수 있다.

chunk도 같은 방식으로 `chunk_key`와 `chunk_id`를 함께 둔다.

### 4.5 category와 usage_scope 기반 확장

문서는 모두 RAG 후보로 들어오지만 성격이 다르기 때문에 `category`와 `usage_scope`를 사용해 구분했다.

| category | 용도 |
|---|---|
| `indoor_care` | 실내식물 관리 |
| `crop_care` | 작물 재배 관리 |
| `ornamental_care` | 관상식물/화훼 관리 |
| `herb` | 허브 관리 |
| `pest_reference` | 병해충 참고 |
| `pesticide_safety` | 농약 안전사용기준 참고 |
| `crop_growth_stage` | 생육단계 참고 |
| `weather_context` | 기상 기반 확장 후보 |

`usage_scope`는 해당 문서를 어떤 수준으로 답변에 사용할지 구분한다.

```text
rag
rag_and_catalog
reference_only
safety_reference_only
expert_case_reference
context_later
```

이 구조를 사용하면 Backend에서 질문 유형별 검색 전략을 다르게 가져갈 수 있다.

```text
일반 관리 질문 → indoor_care, crop_care, ornamental_care 우선
병해충 의심 질문 → pest_reference 보조 사용
농약 관련 질문 → pesticide_safety는 안전 기준 확인용으로만 사용
기상 관련 질문 → weather_context를 보조 context로 사용
```

### 4.6 safety_tags 기반 안전 제어

병해충, 농약, 전문가 상담 데이터는 확정 진단이나 처방처럼 노출되면 위험하다. 그래서 전처리 단계부터 `safety_tags`를 붙였다.

| safety_tags | 의미 |
|---|---|
| `not_diagnosis` | 확정 진단이 아님 |
| `expert_check_required` | 전문가 확인 필요 |
| `pesticide_caution` | 농약/약제/방제 안전 문구 필요 |
| `observation_reference_only` | 관찰 참고용 |
| `expert_case_reference` | 전문가 상담 사례 참고용 |

이 metadata는 Backend 답변 생성 시 안전 문구를 강제하는 데 사용할 수 있다. 예를 들어 검색된 chunk에 `pesticide_caution`이 있으면 농약 라벨 확인, 안전사용기준 준수, 전문가 상담 안내를 함께 노출할 수 있다.

### 4.7 검증 스크립트 기반 품질 관리

데이터가 늘어나면 사람이 모든 chunk를 확인하기 어렵기 때문에 검증 스크립트를 두었다.

`validate_processed_data.py`는 다음을 확인한다.

```text
source 필수 필드
chunk 필수 필드
UUID 형식
chunk-source 연결
농약 category의 pesticide_caution 태그
embedding 차원
```

`validate_data_coverage.py`는 다음을 확인한다.

```text
plant_catalog에 있는 식물이 RAG 관리 문서로 커버되는지
약한 참고 문서만 있는지
아예 RAG 문서가 없는지
```

이 구조는 식물 수가 늘어날수록 중요하다. 새 식물을 추가했을 때 단순히 검색 목록에만 있는지, 실제 답변 근거까지 확보되었는지 확인할 수 있기 때문이다.

---

## 5. 우선 대상 식물/작물과 확장 과정

초기 대상은 MVP에서 사용자가 자주 등록하거나 질문할 가능성이 높은 식물과 작물을 기준으로 잡았다. 기준 브랜치의 식물 목록은 `priority_plant_catalog.jsonl`에 seed 형태로 정리되었고, 이후 RAG 커버리지와 서비스 사용성을 고려해 점진적으로 확장되었다.

### 5.1 초기 우선 대상

초기 우선 대상은 크게 실내식물/ 작물 두 그룹으로 나눌 수 있다.

식내식물 그룹은 사용자가 실내에서 키우는 반려식물을 포함하며, 물주기/빛/온도/과습 질문이 자주 발생할 수 있는 식물이다.

```text
몬스테라
스투키
스파티필럼
금전수
선인장
테이블야자
홍콩야자
호접란
보스턴고사리
관음죽
```

두 번째는 작물이다. 농사로/농촌진흥청 공식 자료와 병해충 자료를 연결하기 쉽고, 재배관리 질문이 자주 나올 수 있는 작물5종을 1차적으로 선정했다.

```text
토마토
고추
상추
오이
딸기
```

이 두 그룹은 서비스의 1차 MVP에서 가장 현실적인 질문이 많이 나올 것으로 보고 우선 대상으로 삼았다.

### 5.2 실내식물 대상 확장

초기 실내식물 목록 이후, 검색/자동완성 범위를 넓히기 위해 실내 관엽식물과 허브류가 추가되었다.

확장된 실내식물/관엽식물 예시는 다음과 같다.

```text
벵갈고무나무
인도고무나무
스킨답서스
필로덴드론
알로카시아
칼라데아
마란타
아레카야자
드라세나
행운목
개운죽
올리브나무
```

허브류 또한 수요가 많을 수 있어 별도로 포함했다.

```text
로즈마리
바질
민트
라벤더
```

이 확장은 식물 검색 경험을 먼저 넓히기 위한 것이다. 다만 모든 식물에 대해 동일한 수준의 RAG 관리 문서가 확보된 것은 아니므로, `validate_data_coverage.py`로 관리 문서 커버리지를 별도 확인할 수 있게 했다.

### 5.3 작물 대상 확장

초기 작물 이후에는 텃밭/가정재배에서 자주 등장하는 작물과 농사로 자료에서 연결 가능한 작물을 중심으로 확장했다.

확장된 작물 예시는 다음과 같다.

```text
방울토마토
파프리카
배추
양배추
감자
고구마
가지
호박
콩
완두
옥수수
벼
...
```

작물 확장의 기준은 다음과 같다.

```text
가정 재배 가능성
농사로/농촌진흥청 자료 연결 가능성
병해충 데이터 연결 가능성
생육단계/농작업 일정 문서 존재 가능성
사용자 질문 가능성
```

작물 데이터는 단순 이름 목록이 아니라, 농사로 작목정보, cropEbook, 농작업 일정, NCPMS 병해충 참고 자료와 연결될 수 있도록 category를 `crop_care` 중심으로 구성했다.

### 5.4 관상식물/화훼 대상 확장

초기 실내식물과 작물만으로는 사용자가 실제로 검색할 수 있는 식물 범위가 좁기 때문에, 관상식물과 화훼류도 확장 대상에 포함했다.

예시는 다음과 같다.

```text
장미
벚나무
개나리
해바라기
국화
튤립
백합
수국
카네이션
코스모스
무궁화
...
```

이 그룹은 `ornamental_care` category로 분리할 수 있도록 설계했다. 병해충 문서나 작물 재배 문서와 섞이지 않게 관리하기 위한 구조다.


### 5.5 대상 확장의 의미

대상 식물/작물은 다음 순서로 확장되었다고 정리할 수 있다.

```text
1차: MVP 핵심 실내식물 + 일부 작물
2차: 자주 키우는 실내 관엽식물과 허브
3차: 텃밭/가정재배 작물
4차: 관상식물/화훼류
5차: 공식 API와 도감 기반 추가 식물
```

이 확장 방식의 장점은 식물 검색 범위를 넓히면서도, 실제 답변 근거가 부족한 항목을 별도로 추적할 수 있다는 점이다. 즉, 식물명을 먼저 넓게 받아들이고, RAG 관리 문서에서 부족한 부분을 추적하여 점진적으로 보강할 수 있다.

---

## 6. 주요 전처리 데이터 항목

### 6.1 식물 마스터 데이터

식물 마스터 데이터는 `priority_plant_catalog.jsonl`을 기준으로 생성된다. 전처리 코드는 `build_plant_master.py`이다.

주요 필드는 다음과 같다.

```text
plant_id
name_ko
name_scientific
name_en
aliases
family
category
description
source_id
source_url
license
collected_at
safety_tags
```

이 데이터는 식물 검색과 등록의 기준이 되며, RAG 답변 근거와는 분리된다.

### 6.2 농사로 실내식물 데이터

농사로 실내정원용 식물 데이터는 실내식물 관리 답변의 공식 출처로 검토했다.

주요 수집/정리 대상은 다음과 같다.

```text
식물명
과명
생육 온도
습도
광도
물주기
관리 난이도
생육형태
잎색
병충해 코드
배치 장소
```

특이사항은 일부 코드 필드에 대한 별도 목록 API가 확인되지 않았다는 점이다. 그래서 상세 응답의 코드명 필드와 HWP 문서 내의 상세코드표를 함께 활용하는 방식으로 정리했다.

### 6.3 농사로 작물 데이터

농사로 작물 데이터는 RAG 데이터의 초기 핵심 대상이다.

수집 전략은 다음과 같다.

```text
농사로 cropEbook API
+ 농사로 farmTechMain 작물 상세 페이지
+ 농업기술길잡이/농작업 일정
+ NCPMS 병해충 참고
```

작물별로 다음 정보를 확보하는 것을 목표로 했다.

```text
작물명
작물 코드
학명/영명
재배환경
물관리
광도/햇빛
온도
생육단계
병해충
예방/관리 방법
출처 URL
라이선스
```

### 6.4 농사로 농작업 일정 HWPX

농작업 일정 문서는 HWPX 원문 내부 XML을 파싱하여 RAG 문서로 활용할 수 있게 정리했다.

처리 기준은 다음과 같다.

```text
문단 추출
표 셀 단위 파싱
표 내부 문단 중복 제거
정형 표는 문장형 변환
비정형 표는 행 구조 보존
기존 metadata는 유지하고 text만 교체
```

이 작업은 작물별 시기, 생육 단계, 작업 흐름을 답변 근거로 활용하기 위한 기반이다.

### 6.5 네이버 지식백과 식물 문서

네이버 지식백과는 공식 농업 데이터에서 부족한 식물 일반 설명, 학명, 형태적 특징, 관리 조건을 보강하기 위해 사용했다.

수집 흐름은 다음과 같다.

```text
네이버 백과사전 API로 URL 후보 수집
→ 사람이 manual_url/use/review_status 검수
→ Playwright로 렌더링 본문 수집
→ 식물별 문서로 그룹화
→ RAG 입력 후보로 정리
```

이 구조는 네이버 지식백과 API 반환이 검색 시 최상단 문서부터 반영된다는 점을 고려하여, 사람이 검수한 URL을 우선 사용할 수 있는 구조를 구축하기 위함이다.

### 6.6 NCPMS 병해충 참고 데이터

NCPMS 데이터는 병해충 증상, 발생 조건, 방제 관련 참고 정보를 보강하기 위한 데이터이다.

주요 처리 기준은 다음과 같다.

```text
SVC01 병 검색 → SVC05 병 상세
SVC03 해충 검색 → SVC07 해충 상세
SVC41 상담 검색 → SVC42 상담 상세
SVC16 통합검색은 discovery 용도
```

농약/약제/방제 문구가 포함된 경우 `pesticide_caution` 태그를 붙이고, 상담 사례는 `expert_case_reference`로 분리한다.

### 6.7 PSIS 농약 안전 참고 데이터

PSIS 데이터는 농약 안전사용기준 확인용 참고 데이터로만 분류했다.

이 데이터는 직접 처방 근거가 아니라 다음 안내를 위한 보조 근거다.

```text
등록 농약 여부 확인
라벨 확인
안전사용기준 준수
전문가 상담 권장
```

### 6.8 AI Hub 라벨 기반 보조 데이터

AI Hub 데이터는 원본 이미지 중심이 아니라 라벨 JSON을 활용한 텍스트 보조 문서로 제한했다.

활용 방향은 다음과 같다.

```text
원예식물 관수/수분/센서 상태 요약
육묘장 작물 생육단계 라벨 요약
관찰 참고용 RAG 보조 문서
```

---

## 7. 주요 산출물

이번 전처리 구조에서 의미 있는 산출물은 다음과 같다.

| 산출물 | 설명 |
|---|---|
| `plant_master.sample.jsonl` | 식물 검색/등록/자동완성용 식물 마스터 |
| `rag_sources.sample.jsonl` | RAG 출처 테이블 적재 후보 |
| `rag_chunks.sample.jsonl` | RAG 검색 대상 chunk |
| `rag_documents.normalized.jsonl` | 공통 schema로 정규화된 중간 문서 |
| `rag_chunks.*.jsonl` | 출처별 chunk 산출물 |
| `rag_chunks.*.embedded.jsonl` | embedding 포함 chunk 산출물 |
| `source_registry.json` | 출처별 정책, 라이선스, category, safety tag |
| `category_taxonomy.json` | category와 증상 키워드 기준 |
| `data_gap_report_2026-07-02.md` | 현재 커버리지 부족 영역 정리 |

---

## 8. 작업 중 특이사항

이번 작업에서 남길 만한 특이사항은 다음과 같다.

첫째, 식물 카탈로그와 RAG 문서를 분리했다. 덕분에 검색 가능한 식물과 실제 관리 답변 근거가 있는 식물을 구분할 수 있다.

둘째, 대상 식물은 초기 실내식물과 일부 작물에서 시작했지만, 이후 관엽식물, 허브, 텃밭 작물, 관상식물까지 확장되었다. 확장된 모든 식물에 따라 동일한 수준의 RAG 근거가 있는 것은 아니므로 커버리지 검증으로 추적하였으며, 추후 확장 시에 이 작업이 요구된다.

셋째, 농사로 실내식물 API 문서에서 일부 코드 목록 operation이 확인되지 않아, 상세 응답의 코드명 필드와 HWP 상세코드표를 함께 활용하는 방식으로 정리했다.

넷째, 네이버 지식백과는 API 결과를 그대로 사용하지 않고 수동 URL 검수 단계를 두었다. 이는 식물명 검색 API 호출의 한계를 극복하고, 정확도를 높이기 위한 조치다.

다섯째, 농작업 일정 HWPX는 표 구조가 많아 표를 정형/비정형으로 나누어 처리했다. 정형 표는 문장형으로 바꾸고, 비정형 표는 행 구조를 보존했다.

여섯째, 병해충과 농약 데이터는 전처리 단계부터 안전 태그를 붙였다. 이를 통해 Backend 답변에서 확정 진단이나 직접 처방처럼 보이는 표현을 피할 수 있다.

---

## 9. 결론

이번 데이터 전처리 작업은 식물 관리 AI 서비스의 RAG 기반을 만들기 위한 구조화 작업이었다.

초기에는 MVP에서 질문 가능성이 높은 실내식물과 일부 작물을 우선 대상으로 삼았다. 이후 검색과 등록 범위를 넓히기 위해 관엽식물, 허브, 텃밭 작물, 관상식물까지 식물 카탈로그를 확장했다.

다만 식물명을 넓게 수용하는 것과 답변 근거를 확보하는 것은 별개의 문제이므로, 식물 마스터와 RAG 문서를 분리했다. 이 구조를 통해 향후 식물 수가 늘어나더라도 어떤 식물이 실제 관리 문서로 커버되는지 검증할 수 있다.

또한 출처 정책을 registry로 분리하고, 수집 방식이 달라도 공통 RAG schema로 정규화하도록 설계했기 때문에 새로운 공식 API, 도감, 농업기술 자료, 병해충 자료가 추가되어도 기존 파이프라인을 유지한 채 확장할 수 있다.

최종적으로 이번 전처리 구조는 다음 목표를 만족한다.

```text
식물 검색 가능성 확대
관리 답변 근거 문서 확보
출처/citation 추적
병해충/농약 안전 기준 유지
새 출처와 새 식물 확장 가능
Backend/Supabase 적재 구조와 연결 가능
```