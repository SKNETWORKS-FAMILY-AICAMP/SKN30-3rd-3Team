import type { MutableRefObject } from "react";
import type { ChatResponseMode, Plant } from "../types";
import type { DesignPage } from "../lib/constants";

export type DashboardPlantCategory = "all" | "indoor" | "crop" | "ornamental";

/**
 * 페이지 모듈들이 공유하는 App 컨텍스트.
 * 각 페이지 팩토리는 필요한 항목만 구조 분해해 기존 함수 본문을 그대로 사용한다.
 */
export interface AppContext {
  /** 이 문서(iframe)가 로드된 시점의 페이지 */
  page: DesignPage;
  navigate: (nextPage: DesignPage) => void;
  handleApiError: (doc: Document, error: unknown) => boolean;
  removePlant: (doc: Document, plantId: string) => Promise<void>;
  resolvePlantId: (doc: Document) => Promise<string>;
  selectedSpeciesRef: MutableRefObject<string>;
  profilePhotoRef: MutableRefObject<File | null>;
  pendingChatPhotoRef: MutableRefObject<File | null>;
  pendingChatPhotoNoteRef: MutableRefObject<string>;
  forceNewChatSessionRef: MutableRefObject<boolean>;
  chatResponseModeRef: MutableRefObject<ChatResponseMode>;
  dashboardPlantsRef: MutableRefObject<Plant[]>;
}
