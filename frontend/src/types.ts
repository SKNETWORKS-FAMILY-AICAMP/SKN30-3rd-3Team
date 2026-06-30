export type View = "dashboard" | "add" | "detail" | "chat";

export type Plant = {
  id: string;
  name: string;
  species: string;
  location: string;
  sunlight: string;
  createdAt: string;
  imageUrl?: string;
  healthScore?: number;
  moisture?: string;
  nextTask?: string;
};

export type PlantCareChatResponse = {
  summary: string;
  possibleCauses: string[];
  todayActions: string[];
  observationChecklist: string[];
  citations: {
    sourceId: string;
    title: string;
    url?: string;
    publisher?: string;
  }[];
  safetyNotice?: string;
};
