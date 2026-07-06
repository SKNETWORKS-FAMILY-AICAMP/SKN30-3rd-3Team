-- =============================================================================
-- 1) chat_sessions.response_mode 컬럼화
--    기존에는 세션 모드(expert/companion)를 title 접두사("[전문가]"/"[내 식물]")로
--    구분했다. 제목을 수정하면 깨지는 구조라 전용 컬럼으로 승격한다.
-- =============================================================================
ALTER TABLE public.chat_sessions
  ADD COLUMN IF NOT EXISTS response_mode text NOT NULL DEFAULT 'expert'
  CHECK (response_mode IN ('expert', 'companion'));

-- 기존 데이터 백필: title 접두사 기준
UPDATE public.chat_sessions
SET response_mode = 'companion'
WHERE title LIKE '[내 식물]%' AND response_mode <> 'companion';

UPDATE public.chat_sessions
SET response_mode = 'expert'
WHERE title LIKE '[전문가]%' AND response_mode <> 'expert';

-- 세션 목록 조회 패턴(user_id + mode + 최신순) 최적화 인덱스
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_mode_created
  ON public.chat_sessions (user_id, response_mode, created_at DESC);

-- =============================================================================
-- 2) plant_catalog.watering_interval_days 컬럼 추가
--    물주기 리마인더의 종별 권장 간격을 도감에서 관리한다.
--    (백엔드는 이 값을 우선 사용하고, 없으면 키워드 규칙으로 fallback)
-- =============================================================================
ALTER TABLE public.plant_catalog
  ADD COLUMN IF NOT EXISTS watering_interval_days integer NOT NULL DEFAULT 7
  CHECK (watering_interval_days BETWEEN 1 AND 60);

-- 종 그룹별 기본값 시드
-- 다육·선인장류: 건조에 강함 → 14일
UPDATE public.plant_catalog
SET watering_interval_days = 14
WHERE name ~ '(선인장|다육|스투키|산세베리아|산세비에리아|금전수|알로에|틸란드시아|리톱스|세덤|에케베리아|개운죽)'
   OR species ~* '(cactus|sansevieria|dracaena|zamioculcas|aloe|sedum|echeveria|tillandsia)';

-- 허브·채소류: 물 소모가 빠름 → 3일
UPDATE public.plant_catalog
SET watering_interval_days = 3
WHERE name ~ '(바질|민트|고수|루꼴라|상추|깻잎|시금치|부추|토마토|오이|고추|파프리카|딸기|가지)'
   OR species ~* '(basil|mentha|lactuca|lycopersic|cucumis|capsicum|fragaria)';

-- =============================================================================
-- 3) (성능) rag_chunks.text ilike 검색용 trigram 인덱스
--    서버측 키워드 필터(text ilike '%용어%')가 시퀀셜 스캔 대신 인덱스를 타게 한다.
--    데이터가 수만 건으로 늘어나도 키워드 검색 속도를 유지한다.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_rag_chunks_text_trgm
  ON public.rag_chunks USING gin (text gin_trgm_ops);

-- crop_or_plant 배열 contains(cs) 검색용 GIN 인덱스
CREATE INDEX IF NOT EXISTS idx_rag_chunks_crop_or_plant
  ON public.rag_chunks USING gin (crop_or_plant);
