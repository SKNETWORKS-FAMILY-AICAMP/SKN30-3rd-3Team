import {
  createCareLog,
  createPlant,
  searchPlantCatalog,
  storagePathToPublicUrl,
  updatePlant,
  uploadPlantPhoto
} from "../api";
import type { PlantCatalogItem } from "../types";
import { createHiddenFileInput, escapeHtml, fileToResizedDataUrl, frameAlert, normalizedText } from "../lib/dom";
import { daysAgoDateInput, todayDateInput } from "../lib/format";
import { setSelectedPlantId } from "../lib/storage";
import type { AppContext } from "./context";

export function createAddPage(ctx: AppContext) {
  const { navigate, handleApiError, selectedSpeciesRef, profilePhotoRef } = ctx;

  function bindSpeciesAutocomplete(doc: Document) {
    const input = doc.getElementById("species-search") as HTMLInputElement | null;
    const buttons = Array.from(doc.querySelectorAll("#step-2 button")) as HTMLButtonElement[];
    if (!input || buttons.length === 0) return;
    const speciesInput = input;
    const searchBox = speciesInput.closest(".relative") as HTMLElement | null;
    const dropdown = doc.createElement("div");
    dropdown.className =
      "absolute left-0 right-0 top-full mt-2 z-50 bg-surface-container-lowest border border-outline-variant/20 rounded-xl shadow-lg overflow-hidden hidden";
    dropdown.dataset.speciesDropdown = "true";
    searchBox?.appendChild(dropdown);

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

    function renderSpeciesDropdown(items: PlantCatalogItem[]) {
      dropdown.innerHTML = items.length
        ? items
            .slice(0, 8)
            .map(
              (item) => `<button class="w-full text-left px-4 py-3 hover:bg-growth-light transition-colors" data-name="${escapeHtml(item.name)}" data-species="${escapeHtml(item.species)}">
                <span class="block text-label-md font-bold text-on-surface">${escapeHtml(item.name)}</span>
                <span class="block text-label-sm text-on-surface-variant">${escapeHtml(item.species)}${item.familyName ? ` · ${escapeHtml(item.familyName)}` : ""}</span>
              </button>`
            )
            .join("")
        : `<div class="px-4 py-3 text-label-sm text-on-surface-variant">검색 결과가 없습니다. 직접 입력해도 됩니다.</div>`;
      dropdown.classList.remove("hidden");
      dropdown.querySelectorAll("button[data-species]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.preventDefault();
          const target = button as HTMLElement;
          selectedSpeciesRef.current = target.dataset.species || target.dataset.name || "";
          speciesInput.value = target.dataset.name || target.dataset.species || "";
          dropdown.classList.add("hidden");
        });
      });
    }

    buttons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        const species = button.dataset.species || normalizedText(button.querySelector("p.text-xs"));
        const name = button.dataset.name || normalizedText(button.querySelector("p.font-label-md"));
        selectedSpeciesRef.current = species || name;
        speciesInput.value = name || species;
      });
    });

    let timer = 0;
    speciesInput.addEventListener("input", () => {
      selectedSpeciesRef.current = speciesInput.value.trim();
      window.clearTimeout(timer);
      timer = window.setTimeout(async () => {
        const items = await searchPlantCatalog(speciesInput.value, buttons.length);
        if (items.length > 0) applyCatalogItems(items);
        renderSpeciesDropdown(items);
      }, 250);
    });
    speciesInput.addEventListener("focus", async () => {
      const items = await searchPlantCatalog(speciesInput.value, 8);
      renderSpeciesDropdown(items);
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
    input.addEventListener("change", async () => {
      profilePhotoRef.current = input.files?.[0] ?? null;
      const file = profilePhotoRef.current;
      if (!file) return;

      const label = dropzone.querySelector("p.font-label-md");
      if (label) label.textContent = file.name;

      // 선택한 사진 미리보기 — 아이콘 원 자리를 대체
      let preview = dropzone.querySelector("[data-add-photo-preview]") as HTMLImageElement | null;
      if (!preview) {
        preview = doc.createElement("img");
        preview.dataset.addPhotoPreview = "true";
        preview.alt = "선택한 식물 사진 미리보기";
        preview.className = "w-32 h-32 rounded-2xl object-cover border border-outline-variant/30 shadow-sm mb-4";
        const iconCircle = dropzone.querySelector(".rounded-full") as HTMLElement | null;
        if (iconCircle) {
          iconCircle.classList.add("hidden");
          iconCircle.before(preview);
        } else {
          dropzone.insertBefore(preview, dropzone.firstChild);
        }
      }
      preview.src = await fileToResizedDataUrl(file, 512);
      const hint = dropzone.querySelector("p.text-xs");
      if (hint) hint.textContent = "다시 클릭하면 다른 사진으로 바꿀 수 있어요.";
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
          const imageUrl = storagePathToPublicUrl(photo.storagePath);
          if (imageUrl) {
            await updatePlant(plant.id, { imageUrl }).catch(() => undefined);
          }
        }
        profilePhotoRef.current = null;
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

  return { bindSpeciesAutocomplete, bindAddDateShortcuts, bindAddPhotoPicker, bindAddPlantSubmit };
}
