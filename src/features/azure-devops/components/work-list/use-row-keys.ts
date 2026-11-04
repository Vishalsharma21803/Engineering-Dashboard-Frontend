import { useEffect } from "react";

/** J and K move the focus to the next or previous ticket in the list (outside text fields). */
export function useRowKeys(container: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || (event.key !== "j" && event.key !== "k")) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.closest("[role=dialog],[role=menu],[role=listbox]"))) return;
      const links = [...(container.current?.querySelectorAll<HTMLElement>("[data-row-link]") ?? [])];
      if (links.length === 0) return;
      const index = links.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "j" ? Math.min(links.length - 1, index + 1) : Math.max(0, index === -1 ? 0 : index - 1);
      event.preventDefault();
      links[next]?.focus();
      links[next]?.scrollIntoView({ block: "nearest" });
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [container]);
}
