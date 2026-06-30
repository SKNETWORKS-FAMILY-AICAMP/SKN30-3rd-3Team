import { useEffect, useRef, useState } from "react";

type DesignPage = "dashboard" | "add" | "detail" | "chat";

const pageSources: Record<DesignPage, string> = {
  dashboard: "/design/dashboard.html",
  add: "/design/add_my_plant.html",
  detail: "/design/my_plant_information.html",
  chat: "/design/AI_chatpage.html"
};

const hashToPage: Record<string, DesignPage> = {
  "#dashboard": "dashboard",
  "#add": "add",
  "#detail": "detail",
  "#chat": "chat"
};

function getInitialPage(): DesignPage {
  return hashToPage[window.location.hash] ?? "dashboard";
}

function App() {
  const [page, setPage] = useState<DesignPage>(getInitialPage);
  const frameRef = useRef<HTMLIFrameElement>(null);

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

  function bindFrameNavigation() {
    const frame = frameRef.current;
    const doc = frame?.contentDocument;
    if (!doc) return;

    const linksAndButtons = Array.from(doc.querySelectorAll("a, button"));

    linksAndButtons.forEach((element) => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      const label = text.toLowerCase();

      if (text.includes("AI 상담")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("chat");
        });
      } else if (text.includes("내 식물") || text.includes("Farm하니")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("dashboard");
        });
      } else if (text.includes("등록") || text.includes("추가") || label.includes("add")) {
        element.addEventListener("click", (event) => {
          const target = event.currentTarget as HTMLElement;
          const isFormStepper = target.closest("#form-nav") || target.closest("#form-card");
          if (isFormStepper && page === "add") return;
          event.preventDefault();
          navigate("add");
        });
      } else if (text.includes("상세") || text.includes("성장 일지") || text.includes("몬티")) {
        element.addEventListener("click", (event) => {
          event.preventDefault();
          navigate("detail");
        });
      }
    });

    const plantCards = Array.from(doc.querySelectorAll("[data-alt], article, .group"));
    plantCards.forEach((element) => {
      const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (text.includes("몬스테라") || text.includes("몬티")) {
        element.addEventListener("click", () => navigate("detail"));
      }
    });
  }

  return (
    <iframe
      ref={frameRef}
      className="design-frame"
      key={page}
      src={pageSources[page]}
      title="Farm하니? UI"
      onLoad={bindFrameNavigation}
    />
  );
}

export default App;
