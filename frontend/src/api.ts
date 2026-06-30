import { mockChatResponse, mockPlants } from "./mockData";
import type { Plant, PlantCareChatResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function getPlants(): Promise<Plant[]> {
  try {
    return await request<Plant[]>("/api/v1/plants");
  } catch {
    return mockPlants;
  }
}

export async function createPlant(input: Pick<Plant, "name" | "species" | "location" | "sunlight">): Promise<Plant> {
  try {
    return await request<Plant>("/api/v1/plants", {
      method: "POST",
      body: JSON.stringify(input)
    });
  } catch {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      ...input
    };
  }
}

export async function askPlantCare(question: string, plantId: string): Promise<PlantCareChatResponse> {
  try {
    return await request<PlantCareChatResponse>("/api/v1/chat/plant-care", {
      method: "POST",
      body: JSON.stringify({ plantId, question })
    });
  } catch {
    return mockChatResponse;
  }
}
