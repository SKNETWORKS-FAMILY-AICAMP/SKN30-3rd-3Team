import { clearAuthSession, hasAuthSession, hasSupabaseAuthConfig, searchRagDocuments } from "../api";
import { PENDING_DIAGNOSIS_QUESTION_KEY } from "../lib/constants";
import { escapeHtml, frameAlert, normalizedText } from "../lib/dom";
import { getUserProfilePhoto } from "../lib/storage";
import type { AppContext } from "./context";

export function createChrome(ctx: AppContext) {
  const { page, navigate } = ctx;

  function bindTopSearch(doc: Document) {
    const searchInput = doc.querySelector("header input[type='text']") as HTMLInputElement | null;
    if (!searchInput) return;
    searchInput.placeholder = "공식 문서/식물 데이터 검색...";

    const parent = searchInput.parentElement as HTMLElement | null;
    if (!parent) return;
    parent.style.position = "relative";
    const dropdown = doc.createElement("div");
    dropdown.className =
      "absolute top-full left-0 right-0 mt-2 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg overflow-hidden hidden min-w-[360px]";
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
          const results = await searchRagDocuments(query, 5);
          dropdown.innerHTML = results.length
            ? results
                .map(
                  (item) => `<button class="w-full text-left px-4 py-3 hover:bg-growth-light transition-colors" data-query="${escapeHtml(query)}">
                    <span class="block text-label-md font-bold text-on-surface">${escapeHtml(item.title)}</span>
                    <span class="block text-[11px] text-primary font-bold mt-0.5">${escapeHtml(item.publisher || "공식 문서")}</span>
                    <span class="block text-label-sm text-on-surface-variant mt-1 line-clamp-2">${escapeHtml(item.excerpt)}</span>
                  </button>`
                )
                .join("")
            : `<div class="px-4 py-3 text-label-sm text-on-surface-variant">공식 문서 검색 결과가 없습니다.</div>`;
          dropdown.classList.toggle("hidden", false);
          dropdown.querySelectorAll("button[data-query]").forEach((button) => {
            button.addEventListener("click", (event) => {
              event.preventDefault();
              const selectedQuery = (button as HTMLElement).dataset.query || query;
              searchInput.value = selectedQuery;
              dropdown.classList.add("hidden");
              if (page === "chat") {
                const textarea = doc.querySelector("textarea") as HTMLTextAreaElement | null;
                if (textarea) {
                  textarea.value = `${selectedQuery}에 대해 공식 문서 기준으로 알려줘`;
                  textarea.focus();
                }
              } else {
                localStorage.setItem(PENDING_DIAGNOSIS_QUESTION_KEY, `${selectedQuery}에 대해 공식 문서 기준으로 알려줘`);
                navigate("chat");
              }
            });
          });
        } catch (error) {
          console.warn("[Farmhani] top search failed", error);
        }
      }, 250);
    });
  }

  function bindLogoHome(doc: Document) {
    const logo = Array.from(doc.querySelectorAll("header .flex.items-center.gap-2")).find((element) =>
      normalizedText(element).includes("Farm")
    ) as HTMLElement | undefined;
    if (!logo) return;
    logo.style.cursor = "pointer";
    logo.addEventListener("click", (event) => {
      event.preventDefault();
      navigate("dashboard");
    });
  }

  function bindSessionControls(doc: Document) {
    if (page === "login" || doc.querySelector("[data-session-controls]")) return;
    const header = doc.querySelector("header");
    if (!header) return;

    const rightArea =
      (Array.from(header.querySelectorAll(".flex.items-center.gap-4")).pop() as HTMLElement | undefined) ||
      (header.lastElementChild as HTMLElement | null);
    if (!rightArea) return;

    const storedPhoto = getUserProfilePhoto();
    const existingProfileImage = rightArea.querySelector("img") as HTMLImageElement | null;
    if (existingProfileImage && storedPhoto) {
      existingProfileImage.src = storedPhoto;
      existingProfileImage.alt = "사용자 프로필 사진";
    }

    const isLoggedIn = hasAuthSession() || !hasSupabaseAuthConfig();
    const wrapper = doc.createElement("div");
    wrapper.dataset.sessionControls = "true";
    wrapper.className = "flex items-center gap-2";

    if (!existingProfileImage) {
      const avatar = doc.createElement("div");
      avatar.className =
        "w-8 h-8 rounded-full bg-primary-fixed-dim flex items-center justify-center overflow-hidden border border-outline-variant/20";
      avatar.innerHTML = storedPhoto
        ? `<img alt="사용자 프로필 사진" class="w-full h-full object-cover" src="${escapeHtml(storedPhoto)}">`
        : '<span class="material-symbols-outlined text-primary text-[18px]">person</span>';
      wrapper.appendChild(avatar);
    }

    const button = doc.createElement("button");
    button.type = "button";
    button.className =
      "px-3 py-2 rounded-full bg-surface-container-high text-on-surface text-label-sm font-bold border border-outline-variant/20 hover:bg-growth-light hover:text-primary transition-all";
    button.textContent = isLoggedIn ? "로그아웃" : "로그인";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (isLoggedIn) {
        clearAuthSession();
        frameAlert(doc, "로그아웃되었습니다.");
      }
      navigate("login");
    });
    wrapper.appendChild(button);
    rightArea.appendChild(wrapper);
  }

  function bindGenericControls(doc: Document) {
    doc.querySelectorAll("button, a").forEach((element) => {
      const text = normalizedText(element);
      const target = element as HTMLElement;
      if (target.id === "auth-submit" || target.id === "toggle-auth") return;
      if (page === "add" && target.closest("#form-card")) return;
      if (page === "dashboard" && target.closest("aside")) return;
      if (page === "detail" && target.closest("aside")) return;

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
      if (page === "detail" && (text.includes("물주기 기록") || text.includes("새 일지 작성") || text.includes("edit"))) return;
      if (page === "detail" && target.closest("aside")) return;
      if (target.closest("[data-plant-card]") || target.closest("[data-water-plant]")) return;
      if (target.closest("button[title='사진 업로드']")) return;
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

  return { bindTopSearch, bindLogoHome, bindSessionControls, bindGenericControls, bindFrameNavigation };
}
