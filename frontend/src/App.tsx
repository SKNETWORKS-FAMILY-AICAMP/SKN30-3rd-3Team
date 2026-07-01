import { useEffect, useRef, useState } from "react";
import {
  askPlantCare,
  createCareLog,
  createPlant,
  getAccessToken,
  getPlant,
  getPlants,
  hasAuthSession,
  hasSupabaseAuthConfig,
  isAuthRequiredError,
  listChatMessages,
  listChatSessions,
  searchPlantCatalog,
  signInWithPassword,
  signUpWithPassword,
  storagePathToPublicUrl,
  updatePlant,
  uploadPlantPhoto
} from "./api";
import type { ChatMessage, ChatSession, Plant, PlantCareChatResponse, PlantCatalogItem } from "./types";

type DesignPage = "login" | "dashboard" | "add" | "detail" | "chat";

const pageSources: Record<DesignPage, string> = {
  login: "/design/Login.html",
  dashboard: "/design/dashboard.html",
  add: "/design/add_my_plant.html",
  detail: "/design/my_plant_information.html",
  chat: "/design/AI_chatpage.html"
};

const hashToPage: Record<string, DesignPage> = {
  "#login": "login",
  "#dashboard": "dashboard",
  "#add": "add",
  "#detail": "detail",
  "#chat": "chat"
};

const SELECTED_PLANT_ID_KEY = "farmhani_selected_plant_id";
const LAST_PHOTO_ID_KEY = "farmhani_last_photo_id";
const LAST_SESSION_ID_KEY = "farmhani_last_session_id";
const PENDING_DIAGNOSIS_QUESTION_KEY = "farmhani_pending_diagnosis_question";

const defaultPlantImages = [
  "https://images.unsplash.com/photo-1614594975525-e45190c55d0b?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1598880940080-ff9a29891b85?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1622205313162-be1d5712a43d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1521334884684-d80222895322?auto=format&fit=crop&w=1200&q=80"
];

function getInitialPage(): DesignPage {
  return hashToPage[window.location.hash] ?? "login";
}

function normalizedText(element: Element | null) {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function frameAlert(doc: Document, message: string) {
  doc.defaultView?.alert(message);
}

function setSelectedPlantId(plantId: string) {
  localStorage.setItem(SELECTED_PLANT_ID_KEY, plantId);
}

function getSelectedPlantId() {
  return localStorage.getItem(SELECTED_PLANT_ID_KEY);
}

function setLastSessionId(sessionId?: string) {
  if (sessionId) localStorage.setItem(LAST_SESSION_ID_KEY, sessionId);
}

function formatDate(value?: string | null) {
  if (!value) return "기록 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoDateInput(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function createHiddenFileInput(doc: Document) {
  const input = doc.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/webp";
  input.style.display = "none";
  doc.body.appendChild(input);
  return input;
}

function findPlantGrid(doc: Document) {
  const plantSection = Array.from(doc.querySelectorAll("section")).find((section) => {
    const heading = section.querySelector("h2");
    return normalizedText(heading).includes("내 식물");
  });
  const preciseGrid = plantSection?.querySelector(".grid");
  if (preciseGrid) return preciseGrid as HTMLElement;

  return Array.from(doc.querySelectorAll(".grid")).find((element) => {
    const text = normalizedText(element);
    return text.includes("새 식물 추가") && (text.includes("몬스테라") || text.includes("내 식물"));
  }) as HTMLElement | undefined;
}

function plantCardHtml(plant: Plant, index: number) {
  const image = plant.imageUrl || "/design/dashboard_plant.png";
  const status = plant.healthScore && plant.healthScore < 70 ? "주의 필요" : "건강함";
  const badgeClass =
    status === "주의 필요"
      ? "bg-diagnostic-red/10 border border-diagnostic-red/20 text-diagnostic-red"
      : "bg-white/80 text-primary";

  return `<div class="bg-surface-container-lowest rounded-3xl overflow-hidden shadow-sm hover:shadow-md transition-all group cursor-pointer border border-outline-variant/10" data-plant-card="${escapeHtml(plant.id)}">
    <div class="relative h-48 overflow-hidden">
      <img alt="${escapeHtml(plant.name)} 식물 사진" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" src="${escapeHtml(image)}">
      <div class="absolute top-4 right-4 ${badgeClass} backdrop-blur-md px-3 py-1 rounded-full text-label-sm font-bold flex items-center gap-1">
        <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">${status === "주의 필요" ? "warning" : "check_circle"}</span>
        ${status}
      </div>
    </div>
    <div class="p-6">
      <h3 class="text-headline-sm font-headline-md mb-1">${escapeHtml(plant.name)}</h3>
      <p class="text-label-sm text-on-surface-variant mb-4">${escapeHtml(plant.species || "품종 미지정")} · ${escapeHtml(plant.location || "위치 미지정")}</p>
      <div class="flex items-center justify-between border-t border-outline-variant/10 pt-4">
        <div class="flex flex-col">
          <span class="text-[10px] uppercase tracking-wider text-outline">등록일</span>
          <span class="text-label-md font-medium">${formatDate(plant.createdAt)}</span>
          <span class="text-[10px] uppercase tracking-wider text-tertiary mt-2">다음 관리</span>
          <span class="text-label-sm font-medium text-tertiary">${escapeHtml(plant.nextTask || "관찰 기록 대기")}</span>
        </div>
        <button class="w-10 h-10 rounded-full bg-growth-light text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-all" data-water-plant="${escapeHtml(plant.id)}" title="오늘 물주기 기록">
          <span class="material-symbols-outlined">water_drop</span>
        </button>
      </div>
    </div>
  </div>`;
}

function addPlantCardHtml() {
  return `<div class="border-2 border-dashed border-outline-variant rounded-3xl flex flex-col items-center justify-center p-6 hover:bg-surface-container-low transition-all cursor-pointer group" data-add-plant="true">
    <div class="w-16 h-16 rounded-full bg-growth-light flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
      <span class="material-symbols-outlined text-primary text-3xl">add</span>
    </div>
    <p class="text-headline-sm font-headline-md text-tertiary">새 식물 추가</p>
    <p class="text-label-sm text-on-surface-variant text-center mt-2">나만의 정원을 넓혀보세요</p>
  </div>`;
}

function App() {
  const [page, setPage] = useState<DesignPage>(getInitialPage);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const selectedSpeciesRef = useRef("");
  const profilePhotoRef = useRef<File | null>(null);
  const pendingChatPhotoRef = useRef<File | null>(null);
  const pendingChatPhotoNoteRef = useRef("");
  const dashboardPlantsRef = useRef<Plant[]>([]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(getInitialPage());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  function navigate(nextPage: DesignPage) {
    window.location.hash = nextPage;
    setPage(nextPage);
  }

  function handleApiError(doc: Document, error: unknown) {
    if (isAuthRequiredError(error)) {
      frameAlert(doc, "로그인 세션이 없습니다. 로그인 후 다시 시도해 주세요.");
      navigate("login");
      return true;
    }
    return false;
  }

  async function resolvePlantId(doc: Document) {
    const selected = getSelectedPlantId();
    if (selected) return selected;

    const plants = await getPlants();
    if (plants[0]?.id) {
      setSelectedPlantId(plants[0].id);
      return plants[0].id;
    }

    frameAlert(doc, "등록된 식물이 없습니다. 먼저 식물을 추가해 주세요.");
    navigate("add");
    throw new Error("No plant profile exists.");
  }

  function bindAuth(doc: Document) {
    const submit = doc.getElementById("auth-submit") as HTMLButtonElement | null;
    const email = doc.getElementById("email") as HTMLInputElement | null;
    const password = doc.getElementById("password") as HTMLInputElement | null;
    const toggle = doc.getElementById("toggle-auth") as HTMLButtonElement | null;
    if (!submit) return;

    let isLogin = true;
    if (toggle) {
      const cleanToggle = toggle.cloneNode(true) as HTMLButtonElement;
      toggle.replaceWith(cleanToggle);
      cleanToggle.addEventListener("click", (event) => {
        event.preventDefault();
        isLogin = !isLogin;
        const title = doc.querySelector("h2");
        const subtitle = title?.nextElementSibling;
        if (title) title.textContent = isLogin ? "시작하기" : "회원가입";
        if (subtitle) {
          subtitle.textContent = isLogin ? "회원이 되어 스마트한 식물 생활을 시작하세요." : "식물 관리의 시작, Farm하니? 와 함께하세요.";
        }
        submit.innerHTML = isLogin
          ? '로그인 <span class="material-symbols-outlined text-[18px]" data-icon="arrow_forward">arrow_forward</span>'
          : '가입하기 <span class="material-symbols-outlined text-[18px]" data-icon="person_add">person_add</span>';
        cleanToggle.textContent = isLogin ? "회원가입" : "로그인하기";
      });
    }

    doc.querySelectorAll("button").forEach((button) => {
      if (normalizedText(button).includes("비밀번호 찾기")) {
        button.addEventListener("click", () => frameAlert(doc, "비밀번호 재설정은 Supabase Auth 메일 설정 후 연결 예정입니다."));
      }
    });

    submit.addEventListener("click", async (event) => {
      event.preventDefault();

      if (!hasSupabaseAuthConfig()) {
        navigate("dashboard");
        return;
      }

      const emailValue = email?.value.trim() ?? "";
      const passwordValue = password?.value ?? "";
      if (!emailValue || !passwordValue) {
        frameAlert(doc, "이메일과 비밀번호를 입력해 주세요.");
        return;
      }

      submit.setAttribute("disabled", "true");
      try {
        if (isLogin) {
          await signInWithPassword(emailValue, passwordValue);
          navigate("dashboard");
          return;
        }

        const result = await signUpWithPassword(emailValue, passwordValue);
        if (!result.access_token) {
          frameAlert(doc, "회원가입은 완료됐지만 세션이 발급되지 않았습니다. Supabase 이메일 인증을 완료한 뒤 로그인해 주세요.");
          isLogin = true;
          submit.innerHTML = '로그인 <span class="material-symbols-outlined text-[18px]" data-icon="arrow_forward">arrow_forward</span>';
          return;
        }
        navigate("dashboard");
      } catch (error) {
        frameAlert(doc, `인증에 실패했습니다. ${error instanceof Error ? error.message : ""}`);
      } finally {
        submit.removeAttribute("disabled");
      }
    });
  }

  function bindSpeciesAutocomplete(doc: Document) {
    const input = doc.getElementById("species-search") as HTMLInputElement | null;
    const buttons = Array.from(doc.querySelectorAll("#step-2 button")) as HTMLButtonElement[];
    if (!input || buttons.length === 0) return;

    function applyCatalogItems(items: PlantCatalogItem[]) {
      items.slice(0, buttons.length).forEach((item, index) => {
        const button = buttons[index];
        const name = button.querySelector("p.font-label-md");
        const species = button.querySelector("p.text-xs");
        if (name) name.textContent = item.name;
        if (species) species.textContent = item.species;
        button.dataset.name = item.name;
        button.dataset.species = item.species;
      });
    }

    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const species = button.dataset.species || normalizedText(button.querySelector("p.text-xs"));
        const name = button.dataset.name || normalizedText(button.querySelector("p.font-label-md"));
        selectedSpeciesRef.current = species || name;
        input.value = name || species;
      });
    });

    let timer = 0;
    input.addEventListener("input", () => {
      selectedSpeciesRef.current = input.value.trim();
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const items = await searchPlantCatalog(input.value, buttons.length);
        if (items.length > 0) applyCatalogItems(items);
      }, 250);
    });
  }

  function bindAddDateShortcuts(doc: Document) {
    const purchaseDate = doc.getElementById("purchase-date") as HTMLInputElement | null;
    if (!purchaseDate) return;

    doc.querySelectorAll("#step-3 button").forEach((button) => {
      const text = normalizedText(button);
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (text.includes("오늘")) purchaseDate.value = todayDateInput();
        if (text.includes("지난주")) purchaseDate.value = daysAgoDateInput(7);
        if (text.includes("오래전")) purchaseDate.value = daysAgoDateInput(365);
      });
    });
  }

  function bindAddPhotoPicker(doc: Document) {
    const dropzone = doc.querySelector("#step-4 .border-dashed") as HTMLElement | null;
    if (!dropzone) return;

    const input = createHiddenFileInput(doc);
    dropzone.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      profilePhotoRef.current = input.files?.[0] ?? null;
      const label = dropzone.querySelector("p.font-label-md");
      if (label && profilePhotoRef.current) {
        label.textContent = profilePhotoRef.current.name;
      }
    });
  }

  function bindAddPlantSubmit(doc: Document) {
    const nextButton = doc.getElementById("next-btn") as HTMLButtonElement | null;
    const successLink = doc.querySelector("#step-success a") as HTMLAnchorElement | null;
    if (!nextButton) return;
    const submitButton = nextButton;

    let isSubmitting = false;
    async function submitPlant() {
      if (isSubmitting) return false;
      isSubmitting = true;

      const nameInput = doc.getElementById("plant-name") as HTMLInputElement | null;
      const speciesInput = doc.getElementById("species-search") as HTMLInputElement | null;
      const purchaseDate = doc.getElementById("purchase-date") as HTMLInputElement | null;

      const plantName = nameInput?.value.trim() || "새로운 식물";
      const species = selectedSpeciesRef.current || speciesInput?.value.trim() || "품종 미지정";

      submitButton.setAttribute("disabled", "true");
      try {
        const plant = await createPlant({
          name: plantName,
          species,
          location: "실내",
          sunlight: "미지정"
        });
        setSelectedPlantId(plant.id);

        if (purchaseDate?.value) {
          await createCareLog(plant.id, {
            wateredAt: undefined,
            leafCondition: undefined,
            soilCondition: undefined,
            memo: `들여온 날짜: ${purchaseDate.value}`
          }).catch(() => undefined);
        }

        if (profilePhotoRef.current) {
          const photo = await uploadPlantPhoto(plant.id, profilePhotoRef.current, `${plantName} 프로필 사진`);
          localStorage.setItem(LAST_PHOTO_ID_KEY, photo.id);
          const imageUrl = storagePathToPublicUrl(photo.storagePath);
          if (imageUrl) {
            await updatePlant(plant.id, { imageUrl }).catch(() => undefined);
          }
        }
        return true;
      } catch (error) {
        if (!handleApiError(doc, error)) {
          frameAlert(doc, `식물 등록 중 문제가 발생했습니다. ${error instanceof Error ? error.message : ""}`);
        }
        return false;
      } finally {
        submitButton.removeAttribute("disabled");
        isSubmitting = false;
      }
    }

    nextButton.addEventListener(
      "click",
      async (event) => {
        if (!normalizedText(submitButton).includes("등록 완료")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const ok = await submitPlant();
        if (ok) {
          (doc.defaultView as Window & { showSuccess?: () => void }).showSuccess?.();
        }
      },
      true
    );

    successLink?.addEventListener("click", (event) => {
      event.preventDefault();
      navigate("dashboard");
    });
  }

  function renderDashboardPlants(doc: Document, plants: Plant[]) {
    const grid = findPlantGrid(doc);
    if (!grid) return;

    grid.innerHTML = `${plants.map((plant, index) => plantCardHtml(plant, index)).join("")}${addPlantCardHtml()}`;
    grid.querySelectorAll("[data-plant-card]").forEach((card) => {
      card.addEventListener("click", () => {
        const plantId = (card as HTMLElement).dataset.plantCard;
        if (plantId) {
          setSelectedPlantId(plantId);
          navigate("detail");
        }
      });
    });
    grid.querySelectorAll("[data-water-plant]").forEach((button) => {
      button.addEventListener("click", async (event) => {
        event.stopPropagation();
        const plantId = (button as HTMLElement).dataset.waterPlant;
        if (!plantId) return;
        try {
          await createCareLog(plantId, {
            wateredAt: todayDateInput(),
            leafCondition: "사용자가 대시보드에서 빠른 물주기를 기록함",
            soilCondition: "미기록",
            memo: "빠른 물주기 버튼"
          });
          frameAlert(doc, "오늘 물주기 기록을 저장했습니다.");
        } catch (error) {
          if (!handleApiError(doc, error)) frameAlert(doc, "물주기 기록 저장에 실패했습니다.");
        }
      });
    });
    grid.querySelector("[data-add-plant]")?.addEventListener("click", () => navigate("add"));

    const overview = Array.from(doc.querySelectorAll("p")).find((element) => normalizedText(element).includes("식물이 잘 자라고"));
    if (overview) overview.textContent = `${plants.length}개 식물 프로필을 관리 중입니다`;
  }

  function plantSearchText(plant: Plant) {
    return `${plant.name} ${plant.species ?? ""} ${plant.location ?? ""} ${plant.sunlight ?? ""}`.toLowerCase();
  }

  function filterPlantsByQuery(plants: Plant[], query: string) {
    const term = query.trim().toLowerCase();
    if (!term) return plants;
    return plants.filter((plant) => plantSearchText(plant).includes(term));
  }

  function filterPlantsByCategory(plants: Plant[], category: "all" | "succulent" | "foliage") {
    if (category === "all") return plants;
    const keywords =
      category === "succulent"
        ? ["다육", "선인장", "스투키", "산세베리아", "succulent", "cactus", "sansevieria"]
        : ["관엽", "몬스테라", "스파티필럼", "야자", "고무나무", "ficus", "monstera", "spathiphyllum", "palm"];
    return plants.filter((plant) => keywords.some((keyword) => plantSearchText(plant).includes(keyword.toLowerCase())));
  }

  function setSidebarActive(items: HTMLElement[], activeItem: HTMLElement) {
    items.forEach((item) => {
      item.classList.remove("text-primary", "font-bold", "bg-growth-light");
      item.classList.add("text-on-surface-variant");
    });
    activeItem.classList.add("text-primary", "font-bold", "bg-growth-light");
    activeItem.classList.remove("text-on-surface-variant");
  }

  function bindDashboardSidebar(doc: Document, plants: Plant[]) {
    const items = Array.from(doc.querySelectorAll("aside .space-y-1 > div")) as HTMLElement[];
    const succulentCount = filterPlantsByCategory(plants, "succulent").length;
    const foliageCount = filterPlantsByCategory(plants, "foliage").length;

    items.forEach((item) => {
      const text = normalizedText(item);
      const badge = item.querySelector(".ml-auto");
      if (text.includes("다육")) badge && (badge.textContent = String(succulentCount));
      if (text.includes("관엽")) badge && (badge.textContent = String(foliageCount));

      item.addEventListener("click", (event) => {
        event.preventDefault();
        setSidebarActive(items, item);
        if (text.includes("다육")) {
          renderDashboardPlants(doc, filterPlantsByCategory(dashboardPlantsRef.current, "succulent"));
          return;
        }
        if (text.includes("관엽")) {
          renderDashboardPlants(doc, filterPlantsByCategory(dashboardPlantsRef.current, "foliage"));
          return;
        }
        if (text.includes("최근 진단")) {
          navigate("chat");
          return;
        }
        renderDashboardPlants(doc, dashboardPlantsRef.current);
      });
    });

    const categoryButton = Array.from(doc.querySelectorAll("aside button")).find((button) =>
      normalizedText(button).includes("카테고리 추가")
    ) as HTMLButtonElement | undefined;
    categoryButton?.addEventListener("click", (event) => {
      event.preventDefault();
      const keyword = doc.defaultView?.prompt("필터링할 식물 이름이나 품종 키워드를 입력해 주세요.")?.trim();
      if (!keyword) return;
      renderDashboardPlants(doc, filterPlantsByQuery(dashboardPlantsRef.current, keyword));
    });
  }

  function bindTopSearch(doc: Document) {
    const searchInput = Array.from(doc.querySelectorAll("header input[type='text']")).find((input) =>
      (input as HTMLInputElement).placeholder.includes("검색")
    ) as HTMLInputElement | undefined;
    if (!searchInput) return;

    if (page === "dashboard") {
      searchInput.addEventListener("input", () => {
        renderDashboardPlants(doc, filterPlantsByQuery(dashboardPlantsRef.current, searchInput.value));
      });
      return;
    }

    const parent = searchInput.parentElement as HTMLElement | null;
    if (!parent) return;
    parent.style.position = "relative";
    const dropdown = doc.createElement("div");
    dropdown.className =
      "absolute top-full left-0 right-0 mt-2 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg overflow-hidden hidden";
    dropdown.dataset.searchResults = "true";
    parent.appendChild(dropdown);

    let timer: ReturnType<typeof setTimeout> | undefined;
    searchInput.addEventListener("input", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        const query = searchInput.value.trim();
        if (query.length < 2) {
          dropdown.classList.add("hidden");
          dropdown.innerHTML = "";
          return;
        }
        try {
          const results = await searchPlantCatalog(query, 5);
          dropdown.innerHTML = results.length
            ? results
                .map(
                  (item) => `<button class="w-full text-left px-4 py-3 hover:bg-growth-light transition-colors" data-species="${escapeHtml(
                    item.species
                  )}" data-name="${escapeHtml(item.name)}">
                    <span class="block text-label-md font-bold text-on-surface">${escapeHtml(item.name)}</span>
                    <span class="block text-label-sm text-on-surface-variant">${escapeHtml(item.species)}</span>
                  </button>`
                )
                .join("")
            : `<div class="px-4 py-3 text-label-sm text-on-surface-variant">검색 결과가 없습니다.</div>`;
          dropdown.classList.toggle("hidden", false);
          dropdown.querySelectorAll("button[data-species]").forEach((button) => {
            button.addEventListener("click", (event) => {
              event.preventDefault();
              const target = button as HTMLElement;
              selectedSpeciesRef.current = target.dataset.species ?? "";
              searchInput.value = `${target.dataset.name ?? ""} ${target.dataset.species ?? ""}`.trim();
              dropdown.classList.add("hidden");
              if (page !== "add") navigate("add");
            });
          });
        } catch (error) {
          console.warn("[Farmhani] top search failed", error);
        }
      }, 250);
    });
  }

  async function bindDashboardData(doc: Document) {
    if (hasSupabaseAuthConfig() && !hasAuthSession()) {
      frameAlert(doc, "로그인 후 내 식물 목록을 불러올 수 있습니다.");
      navigate("login");
      return;
    }

    try {
      const plants = await getPlants();
      dashboardPlantsRef.current = plants;
      if (plants[0]?.id && !getSelectedPlantId()) setSelectedPlantId(plants[0].id);
      renderDashboardPlants(doc, plants);
      bindDashboardSidebar(doc, plants);
    } catch (error) {
      if (!handleApiError(doc, error)) frameAlert(doc, `식물 목록을 불러오지 못했습니다. ${error instanceof Error ? error.message : ""}`);
    }
  }

  function appendUserMessage(doc: Document, text: string, file?: File | null) {
    const messages = doc.getElementById("chat-messages");
    if (!messages) return;

    const preview = file ? `<p class="mt-2 text-label-sm opacity-80">첨부 사진: ${escapeHtml(file.name)}</p>` : "";
    messages.insertAdjacentHTML(
      "beforeend",
      `<div class="flex flex-col items-end gap-2 animate-fade-in">
        <div class="max-w-[80%] bg-primary-container text-on-primary-container p-4 rounded-2xl rounded-tr-none shadow-sm">
          <p class="text-body-md">${escapeHtml(text)}</p>
          ${preview}
        </div>
        <span class="text-label-sm text-outline">방금</span>
      </div>`
    );
    messages.scrollTop = messages.scrollHeight;
  }

  function appendAssistantLoading(doc: Document) {
    const messages = doc.getElementById("chat-messages");
    if (!messages) return null;

    const wrapper = doc.createElement("div");
    wrapper.className = "flex flex-col items-start gap-2 animate-fade-in";
    wrapper.innerHTML = `<div class="flex items-start gap-3 max-w-[85%]">
      <div class="w-8 h-8 rounded-full bg-sage-accent flex-shrink-0 flex items-center justify-center">
        <span class="material-symbols-outlined text-primary text-[18px]">nature</span>
      </div>
      <div class="bg-surface-container-lowest border border-outline-variant/30 p-5 rounded-2xl rounded-tl-none shadow-sm">
        <p class="text-body-md text-on-surface">공식 자료와 내 식물 기록을 함께 확인하고 있습니다...</p>
      </div>
    </div>`;
    messages.appendChild(wrapper);
    messages.scrollTop = messages.scrollHeight;
    return wrapper;
  }

  function renderAssistantAnswer(doc: Document, wrapper: HTMLElement, answer: PlantCareChatResponse) {
    const causes = answer.possibleCauses
      .map((item) => `<span class="inline-flex rounded-full bg-surface-container px-3 py-1 text-label-sm text-on-surface-variant">${escapeHtml(item)}</span>`)
      .join("");
    const actions = answer.todayActions
      .map(
        (item) => `<div class="flex gap-3 rounded-xl bg-growth-light/40 p-3">
          <span class="material-symbols-outlined text-primary text-[18px] mt-0.5">check_circle</span>
          <p class="text-body-md text-on-surface">${escapeHtml(item)}</p>
        </div>`
      )
      .join("");
    const checklist = answer.observationChecklist
      .map((item) => `<li class="flex gap-2"><span class="text-primary">•</span><span>${escapeHtml(item)}</span></li>`)
      .join("");
    const citations = answer.citations
      .map((item, index) => {
        const label = escapeHtml(item.title || `참조 ${index + 1}`);
        const url = item.url ? ` href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer"` : ' href="#"';
        return `<a class="citation-link inline-flex items-center gap-1 rounded-full bg-growth-light px-2 py-1 text-primary text-[11px] font-bold"${url}>${index + 1}. ${label}</a>`;
      })
      .join(" ");

    wrapper.innerHTML = `<div class="flex items-start gap-3 max-w-[85%]">
      <div class="w-8 h-8 rounded-full bg-sage-accent flex-shrink-0 flex items-center justify-center">
        <span class="material-symbols-outlined text-primary text-[18px]">nature</span>
      </div>
      <div class="bg-surface-container-lowest border border-outline-variant/30 p-5 rounded-2xl rounded-tl-none shadow-sm space-y-5">
        <div class="space-y-2">
          <p class="text-label-sm font-bold text-primary flex items-center gap-2">
            <span class="material-symbols-outlined text-[16px]">auto_awesome</span>지금 보기에는
          </p>
          <p class="text-body-md text-on-surface leading-relaxed">${escapeHtml(answer.summary)}</p>
        </div>
        ${
          actions
            ? `<div class="space-y-2">
                <p class="text-label-md font-bold text-on-surface">오늘 바로 해볼 것</p>
                <div class="space-y-2">${actions}</div>
              </div>`
            : ""
        }
        ${
          causes
            ? `<div class="space-y-2">
                <p class="text-label-md font-bold text-on-surface">가능성이 있는 원인</p>
                <div class="flex flex-wrap gap-2">${causes}</div>
              </div>`
            : ""
        }
        ${
          checklist
            ? `<div class="rounded-xl border border-outline-variant/20 p-3">
                <p class="text-label-md font-bold text-on-surface mb-2">다음 관찰 포인트</p>
                <ul class="space-y-1 text-body-md text-on-surface-variant">${checklist}</ul>
              </div>`
            : ""
        }
        ${citations ? `<div class="flex flex-wrap gap-2 pt-2">${citations}</div>` : ""}
        ${answer.safetyNotice ? `<p class="text-[11px] text-outline">${escapeHtml(answer.safetyNotice)}</p>` : ""}
      </div>
    </div>
    <span class="text-label-sm text-outline ml-11">방금</span>`;

    const messages = doc.getElementById("chat-messages");
    if (messages) messages.scrollTop = messages.scrollHeight;
  }

  function renderReferences(doc: Document, citations: PlantCareChatResponse["citations"]) {
    const pane = doc.getElementById("reference-pane");
    if (!pane || citations.length === 0) return;

    pane.innerHTML = citations
      .map((item, index) => {
        const title = escapeHtml(item.title || `참조 ${index + 1}`);
        const publisher = escapeHtml(item.publisher || "공식 자료");
        const sourceId = escapeHtml(item.sourceId || "");
        const link = item.url
          ? `<a class="text-label-sm text-primary hover:underline" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">원문 보기</a>`
          : "";
        return `<article class="bg-white p-5 rounded-lg shadow-sm border border-outline-variant/10 transition-all duration-500">
          <div class="flex items-center justify-between mb-3">
            <span class="text-[10px] font-bold text-primary bg-primary-fixed px-2 py-0.5 rounded uppercase tracking-tighter">참조 [${index + 1}]</span>
            <span class="text-label-sm text-outline italic">${publisher}</span>
          </div>
          <h4 class="font-headline-sm text-on-surface mb-2">${title}</h4>
          <p class="text-body-md text-on-surface-variant break-all">${sourceId}</p>
          <div class="mt-4 pt-4 border-t border-outline-variant/10">${link}</div>
        </article>`;
      })
      .join("");
  }

  function renderHistoryMessage(doc: Document, message: ChatMessage) {
    if (message.sender === "user") {
      appendUserMessage(doc, message.content);
      return;
    }

    const messages = doc.getElementById("chat-messages");
    if (!messages) return;
    const citations = message.citations || [];
    messages.insertAdjacentHTML(
      "beforeend",
      `<div class="flex flex-col items-start gap-2 animate-fade-in">
        <div class="flex items-start gap-3 max-w-[85%]">
          <div class="w-8 h-8 rounded-full bg-sage-accent flex-shrink-0 flex items-center justify-center">
            <span class="material-symbols-outlined text-primary text-[18px]">nature</span>
          </div>
          <div class="bg-surface-container-lowest border border-outline-variant/30 p-5 rounded-2xl rounded-tl-none shadow-sm whitespace-pre-line">
            ${escapeHtml(message.content)}
          </div>
        </div>
      </div>`
    );
    if (citations.length) renderReferences(doc, citations);
  }

  async function loadChatMessages(doc: Document, sessionId: string) {
    try {
      const messages = await listChatMessages(sessionId);
      const container = doc.getElementById("chat-messages");
      if (container) container.innerHTML = "";
      messages.forEach((message) => renderHistoryMessage(doc, message));
      localStorage.setItem(LAST_SESSION_ID_KEY, sessionId);
    } catch (error) {
      if (!handleApiError(doc, error)) frameAlert(doc, "대화 내역을 불러오지 못했습니다.");
    }
  }

  async function renderChatSessions(doc: Document) {
    if (hasSupabaseAuthConfig() && !hasAuthSession()) return;
    const container = doc.querySelector("aside .space-y-1.mb-8") as HTMLElement | null;
    if (!container) return;

    try {
      const sessions = await listChatSessions();
      container.innerHTML = `<div class="flex items-center gap-3 p-3 mb-1 cursor-pointer hover:bg-growth-light dark:hover:bg-tertiary-container rounded-lg transition-all duration-200 text-on-surface-variant" data-chat-home="true">
        <span class="material-symbols-outlined">home</span>
        <span class="font-label-md">홈 개요</span>
      </div>
      <div class="mt-4 mb-2 px-3">
        <span class="text-label-sm uppercase tracking-wider font-bold text-outline">진단 목록</span>
      </div>
      ${sessions.map((session, index) => chatSessionItemHtml(session, index)).join("")}`;

      container.querySelector("[data-chat-home]")?.addEventListener("click", () => navigate("dashboard"));
      container.querySelectorAll("[data-chat-session]").forEach((item) => {
        item.addEventListener("click", () => {
          const sessionId = (item as HTMLElement).dataset.chatSession;
          if (sessionId) void loadChatMessages(doc, sessionId);
        });
      });

      const lastSession = localStorage.getItem(LAST_SESSION_ID_KEY);
      if (lastSession && sessions.some((session) => session.id === lastSession)) {
        void loadChatMessages(doc, lastSession);
      }
    } catch (error) {
      if (!handleApiError(doc, error)) console.warn("[Farmhani] chat sessions unavailable", error);
    }
  }

  function chatSessionItemHtml(session: ChatSession, index: number) {
    const selected = localStorage.getItem(LAST_SESSION_ID_KEY) === session.id || index === 0;
    const className = selected ? "text-primary font-bold" : "text-on-surface-variant";
    return `<div class="flex items-center gap-3 p-3 mb-1 cursor-pointer hover:bg-growth-light rounded-lg ${className}" data-chat-session="${escapeHtml(session.id)}">
      <span class="material-symbols-outlined">eco</span>
      <span class="font-label-md">상담 ${formatDate(session.createdAt)}</span>
    </div>`;
  }

  function bindChatPhotoPicker(doc: Document) {
    const photoButton = doc.querySelector("button[title='사진 업로드']") as HTMLButtonElement | null;
    if (!photoButton) return;

    const input = createHiddenFileInput(doc);
    photoButton.addEventListener("click", (event) => {
      event.preventDefault();
      input.click();
    });
    input.addEventListener("change", () => {
      pendingChatPhotoRef.current = input.files?.[0] ?? null;
      if (pendingChatPhotoRef.current) {
        pendingChatPhotoNoteRef.current =
          doc.defaultView?.prompt("사진 메모를 입력해 주세요. 예: 아래 잎 노란 반점, 흙이 젖어 있음") ?? "";
      }
    });
  }

  function bindChatSubmit(doc: Document) {
    const textarea = doc.querySelector("textarea") as HTMLTextAreaElement | null;
    const sendButton = textarea?.parentElement?.querySelector("button.bg-primary") as HTMLButtonElement | null;
    if (!textarea || !sendButton) return;
    const chatInput = textarea;
    const chatSendButton = sendButton;

    async function submit() {
      const question = chatInput.value.trim();
      if (!question) return;

      if (hasSupabaseAuthConfig() && !getAccessToken()) {
        frameAlert(doc, "AI 상담은 로그인 후 사용할 수 있습니다.");
        navigate("login");
        return;
      }

      const file = pendingChatPhotoRef.current;
      appendUserMessage(doc, question, file);
      chatInput.value = "";

      const loading = appendAssistantLoading(doc);
      try {
        const plantId = await resolvePlantId(doc);
        let photoId = localStorage.getItem(LAST_PHOTO_ID_KEY) || undefined;

        if (file) {
          const photo = await uploadPlantPhoto(plantId, file, pendingChatPhotoNoteRef.current || question);
          photoId = photo.id;
          localStorage.setItem(LAST_PHOTO_ID_KEY, photo.id);
          pendingChatPhotoRef.current = null;
          pendingChatPhotoNoteRef.current = "";
        }

        const answer = await askPlantCare(question, plantId, { photoId });
        setLastSessionId(answer.sessionId);
        if (loading) renderAssistantAnswer(doc, loading, answer);
        renderReferences(doc, answer.citations);
        void renderChatSessions(doc);
      } catch (error) {
        if (handleApiError(doc, error)) return;
        if (loading) {
          loading.innerHTML = `<div class="bg-error-container text-on-error-container p-4 rounded-2xl shadow-sm">
            상담 요청 중 오류가 발생했습니다. ${escapeHtml(error instanceof Error ? error.message : "")}
          </div>`;
        }
      }
    }

    chatSendButton.addEventListener("click", (event) => {
      event.preventDefault();
      void submit();
    });
    chatInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        void submit();
      }
    });

    const pendingDiagnosisQuestion = localStorage.getItem(PENDING_DIAGNOSIS_QUESTION_KEY);
    if (pendingDiagnosisQuestion) {
      localStorage.removeItem(PENDING_DIAGNOSIS_QUESTION_KEY);
      chatInput.value = pendingDiagnosisQuestion;
      doc.defaultView?.setTimeout(() => void submit(), 250);
    }
  }

  function bindChatQuickPrompts(doc: Document) {
    const textarea = doc.querySelector("textarea") as HTMLTextAreaElement | null;
    if (!textarea) return;

    const promptMap: Record<string, string> = {
      "흔한 해충": "잎 뒷면에 작은 점과 끈적임이 보이는데 흔한 해충 가능성이 있을까요?",
      "빛 요구량": "이 식물은 실내에서 어느 정도 빛을 받아야 건강하게 자랄까요?",
      "몬스테라 번식": "몬스테라를 번식시키려면 어떤 시기와 방법이 안전할까요?"
    };

    doc.querySelectorAll("span, button").forEach((element) => {
      const text = normalizedText(element);
      const prompt = promptMap[text];
      if (!prompt) return;
      element.addEventListener("click", (event) => {
        event.preventDefault();
        textarea.value = prompt;
        textarea.focus();
      });
    });
  }

  function bindDashboardUpload(doc: Document) {
    const uploadBox = Array.from(doc.querySelectorAll(".border-dashed")).find((element) =>
      normalizedText(element).includes("이미지를 드래그하거나 클릭")
    ) as HTMLElement | undefined;
    if (!uploadBox) return;

    const input = createHiddenFileInput(doc);
    uploadBox.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      pendingChatPhotoRef.current = input.files?.[0] ?? null;
      if (pendingChatPhotoRef.current) {
        pendingChatPhotoNoteRef.current = doc.defaultView?.prompt("사진 메모를 입력해 주세요.") ?? "";
        localStorage.setItem(
          PENDING_DIAGNOSIS_QUESTION_KEY,
          pendingChatPhotoNoteRef.current || "첨부한 사진을 기준으로 현재 식물 상태를 진단해 주세요."
        );
        localStorage.removeItem(LAST_SESSION_ID_KEY);
        navigate("chat");
      }
    });
  }

  function bindDetailData(doc: Document) {
    const plantId = getSelectedPlantId();
    if (!plantId || (hasSupabaseAuthConfig() && !hasAuthSession())) return;

    void getPlant(plantId)
      .then((plant) => {
        const heroName = doc.querySelector("h1");
        const heroSpecies = heroName?.nextElementSibling;
        const primaryImage = plant.imageUrl || storagePathToPublicUrl(plant.photos?.[0]?.storagePath) || "/design/dashboard_plant.png";
        if (heroName) heroName.textContent = plant.name;
        if (heroSpecies) heroSpecies.textContent = plant.species || "품종 미지정";
        const heroImage = doc.querySelector(".lg\\:col-span-5 img") as HTMLImageElement | null;
        if (heroImage) {
          heroImage.src = primaryImage;
          heroImage.alt = `${plant.name} 사진`;
        }
        const breadcrumb = Array.from(doc.querySelectorAll("span")).find((element) => normalizedText(element).includes("몬스테라 델리시오사"));
        if (breadcrumb) breadcrumb.textContent = plant.name;

        const overviewTitle = Array.from(doc.querySelectorAll("h2")).find((element) => normalizedText(element).includes("활력 개요"));
        const overviewCopy = overviewTitle?.nextElementSibling as HTMLElement | undefined;
        if (overviewCopy) {
          const logCount = plant.careLogs?.length ?? 0;
          const photoCount = plant.photos?.length ?? 0;
          overviewCopy.textContent = `${logCount}개의 관리 기록과 ${photoCount}장의 사진을 기준으로 확인 중입니다.`;
        }

        const aiTitle = Array.from(doc.querySelectorAll("h3")).find((element) => normalizedText(element).includes("AI 조언"));
        const aiCopy = aiTitle?.nextElementSibling as HTMLElement | undefined;
        if (aiTitle) aiTitle.textContent = `${plant.name}를 위한 AI 조언 받기`;
        if (aiCopy) aiCopy.textContent = "최근 사진과 관리 기록을 바탕으로 맞춤 조언을 확인합니다.";

        const journalTitle = Array.from(doc.querySelectorAll("h2")).find((element) => normalizedText(element).includes("성장 일지"));
        const journalCopy = journalTitle?.nextElementSibling as HTMLElement | undefined;
        if (journalCopy) journalCopy.textContent = `${plant.name}의 사진과 관리 기록입니다.`;

        const waterLog = [...(plant.careLogs ?? [])]
          .filter((log) => log.wateredAt)
          .sort((a, b) => String(b.wateredAt).localeCompare(String(a.wateredAt)))[0];
        const waterIcon = Array.from(doc.querySelectorAll("span.material-symbols-outlined")).find((element) => normalizedText(element) === "water_drop");
        const waterText = waterIcon?.parentElement?.parentElement?.querySelectorAll("p")[1] as HTMLElement | undefined;
        if (waterText) waterText.textContent = waterLog?.wateredAt ? formatDate(waterLog.wateredAt) : "기록 없음";

        const timeline = doc.querySelector(".space-y-12") as HTMLElement | null;
        if (timeline) {
          const careEntries = (plant.careLogs ?? []).map((log) => ({
            type: log.wateredAt ? "물주기" : "관리 기록",
            date: log.wateredAt || log.createdAt,
            title: log.wateredAt ? "물주기 기록" : "관리 메모",
            body: [log.leafCondition, log.soilCondition, log.memo].filter(Boolean).join(" · ") || "관리 기록을 남겼습니다.",
            image: ""
          }));
          const photoEntries = (plant.photos ?? []).map((photo) => ({
            type: "사진",
            date: photo.capturedAt || photo.createdAt,
            title: photo.note || "사진 기록",
            body: `${plant.name}의 상태 사진을 저장했습니다.`,
            image: storagePathToPublicUrl(photo.storagePath) || ""
          }));
          const entries = [...careEntries, ...photoEntries]
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 8);

          timeline.innerHTML = entries.length
            ? entries
                .map(
                  (entry, index) => `<div class="relative flex flex-col md:flex-row items-start md:items-center">
                    <div class="${index % 2 === 0 ? "md:w-1/2 md:pr-12 md:text-right" : "md:w-1/2 md:ml-auto md:pl-12"} order-2 mt-4 md:mt-0">
                      <div class="bg-white p-6 rounded-2xl shadow-sm border border-outline-variant/20 hover:shadow-md transition-all">
                        <span class="text-label-sm text-primary font-bold block mb-2">${escapeHtml(formatDate(entry.date))} · ${escapeHtml(entry.type)}</span>
                        <h4 class="text-headline-md font-bold mb-2">${escapeHtml(entry.title)}</h4>
                        <p class="text-body-md text-on-surface-variant mb-4">${escapeHtml(entry.body)}</p>
                        ${
                          entry.image
                            ? `<div class="rounded-xl overflow-hidden h-44"><img alt="${escapeHtml(entry.title)}" class="w-full h-full object-cover" src="${escapeHtml(entry.image)}"></div>`
                            : ""
                        }
                      </div>
                    </div>
                    <div class="absolute left-[-24px] md:left-1/2 md:transform md:-translate-x-1/2 z-10 w-8 h-8 rounded-full bg-primary border-4 border-white flex items-center justify-center text-white shadow-sm order-1">
                      <span class="material-symbols-outlined text-[16px]">${entry.image ? "image" : "water_drop"}</span>
                    </div>
                  </div>`
                )
                .join("")
            : `<div class="bg-white p-8 rounded-2xl shadow-sm border border-outline-variant/20 text-center">
                <p class="text-headline-sm font-bold text-on-surface mb-2">아직 성장 일지가 없습니다.</p>
                <p class="text-body-md text-on-surface-variant">사진을 추가하거나 물주기 기록을 남기면 이곳에 ${escapeHtml(plant.name)}의 기록이 쌓입니다.</p>
              </div>`;
        }
      })
      .catch((error) => {
        if (!handleApiError(doc, error)) console.warn("[Farmhani] detail load failed", error);
      });
  }

  function bindQuickCareButtons(doc: Document) {
    doc.querySelectorAll("button").forEach((button) => {
      const text = normalizedText(button);
      if (text.includes("물주기 기록")) {
        button.addEventListener("click", async (event) => {
          event.preventDefault();
          const plantId = getSelectedPlantId();
          if (!plantId) return;
          try {
            await createCareLog(plantId, {
              wateredAt: todayDateInput(),
              leafCondition: "상세 화면에서 물주기를 기록함",
              soilCondition: "미기록",
              memo: "상세 화면 빠른 기록"
            });
            frameAlert(doc, "물주기 기록을 저장했습니다.");
          } catch (error) {
            if (!handleApiError(doc, error)) frameAlert(doc, "물주기 저장에 실패했습니다.");
          }
        });
      }
      if (text.includes("새 일지 작성")) {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          const input = createHiddenFileInput(doc);
          input.click();
          input.addEventListener("change", async () => {
            const plantId = getSelectedPlantId();
            const file = input.files?.[0];
            if (!plantId || !file) return;
            try {
              await uploadPlantPhoto(plantId, file, "성장 일지 사진");
              frameAlert(doc, "성장 일지 사진을 저장했습니다.");
            } catch (error) {
              if (!handleApiError(doc, error)) frameAlert(doc, "사진 저장에 실패했습니다.");
            }
          });
        });
      }
    });
  }

  function bindGenericControls(doc: Document) {
    doc.querySelectorAll("button, a").forEach((element) => {
      const text = normalizedText(element);
      const target = element as HTMLElement;
      if (target.id === "auth-submit" || target.id === "toggle-auth") return;
      if (page === "add" && target.closest("#form-card")) return;
      if (page === "dashboard" && target.closest("aside")) return;

      if (text.includes("dark_mode")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          doc.documentElement.classList.toggle("dark");
        });
      } else if (text.includes("notifications")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "새 알림이 없습니다.");
        });
      } else if (text.includes("settings")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "설정 화면은 계정 설정 API 확정 후 연결됩니다.");
        });
      } else if (text.includes("share")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          doc.defaultView?.navigator.clipboard?.writeText(doc.defaultView.location.href);
          frameAlert(doc, "현재 화면 주소를 복사했습니다.");
        });
      } else if (text.includes("more_vert") || text.includes("filter_list") || text.includes("open_in_full") || text.includes("grid_view") || text.includes("view_list")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "보기 옵션을 적용했습니다.");
        });
      } else if (text.includes("출처 보기")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          doc.getElementById("reference-pane")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else if (text.includes("모든 전문가 팁")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("chat");
        });
      } else if (text === "홈") {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("dashboard");
        });
      } else if (text === "채팅" || text.includes("AI 조언")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("chat");
        });
      } else if (text.includes("라이브러리") || text.includes("둘러보기") || text.includes("프로필")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "해당 메뉴는 다음 단계에서 실제 화면으로 확장됩니다.");
        });
      } else if (text.includes("개인정보") || text.includes("이용약관") || text.includes("지원") || text.includes("고객지원") || text.includes("도움말")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "문서/고객지원 페이지는 배포 단계에서 연결합니다.");
        });
      } else if (text.includes("카테고리 추가") || text.includes("새 카테고리")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          frameAlert(doc, "카테고리 기능은 식물 목록 저장 이후 확장 예정입니다.");
        });
      }
    });
  }

  function bindFrameNavigation(doc: Document) {
    doc.querySelectorAll("a, button, [role='button']").forEach((element) => {
      const text = normalizedText(element);
      const label = text.toLowerCase();
      const target = element as HTMLElement;
      const id = target.id;

      if (id === "auth-submit" || id === "toggle-auth") return;
      if (page === "add" && target.closest("#form-card")) return;
      if (target.closest("[data-plant-card]") || target.closest("[data-water-plant]")) return;
      if (text.includes("카테고리")) return;

      if (text.includes("AI 상담") || text.includes("AI 조언") || text.includes("빠른 AI 진단") || label.includes("diagnosis")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("chat");
        });
        return;
      }

      if (text.includes("내 식물") || text.includes("대시보드") || text.includes("홈 개요")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("dashboard");
        });
        return;
      }

      if (text.includes("등록") || text.includes("추가") || label.includes("add")) {
        element.addEventListener("click", (event) => {
          if ((event.currentTarget as HTMLElement).closest("#form-nav")) return;
          event.preventDefault();
          navigate("add");
        });
        return;
      }

      if (text.includes("상세") || text.includes("성장 일지") || text.includes("몬스테라") || text.includes("몬티")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("detail");
        });
      }
    });
  }

  function bindFrame() {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;

    bindGenericControls(doc);
    bindFrameNavigation(doc);
    bindTopSearch(doc);
    if (page === "login") bindAuth(doc);
    if (page === "dashboard") {
      void bindDashboardData(doc);
      bindDashboardUpload(doc);
    }
    if (page === "add") {
      bindSpeciesAutocomplete(doc);
      bindAddDateShortcuts(doc);
      bindAddPhotoPicker(doc);
      bindAddPlantSubmit(doc);
    }
    if (page === "detail") {
      bindDetailData(doc);
      bindQuickCareButtons(doc);
    }
    if (page === "chat") {
      bindChatPhotoPicker(doc);
      bindChatSubmit(doc);
      bindChatQuickPrompts(doc);
      void renderChatSessions(doc);
    }
  }

  return (
    <iframe
      ref={frameRef}
      className="design-frame"
      key={page}
      src={pageSources[page]}
      title="Farm하니 UI"
      onLoad={bindFrame}
    />
  );
}

export default App;
