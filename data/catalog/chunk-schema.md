# RAG Chunk Schema

RAG 인덱싱용 chunk는 아래 필드를 기본으로 사용합니다.

```json
{
  "chunk_id": "source_id:000001",
  "source_id": "nongsaro_indoor_water",
  "title": "문서 제목",
  "publisher": "발행기관",
  "url": "https://example.com",
  "license": "확인된 라이선스 또는 사용 조건",
  "collected_at": "2026-06-29",
  "category": "indoor_care",
  "crop_or_plant": ["토마토", "실내식물"],
  "symptom_keywords": ["잎 변색", "과습", "건조"],
  "safety_tags": ["not_diagnosis", "pesticide_caution"],
  "text": "검색에 사용할 chunk 본문"
}
```

## 필수 원칙

- `chunk_id`는 source 안에서 안정적으로 재생성 가능해야 합니다.
- `url`이 없으면 원문 저장 위치나 source catalog id를 반드시 남깁니다.
- 농약/방제 관련 chunk에는 `pesticide_caution` 또는 유사 safety tag를 붙입니다.
- 사용자에게 노출될 수 있는 citation은 `title`, `publisher`, `url` 또는 `source_id`를 포함해야 합니다.
