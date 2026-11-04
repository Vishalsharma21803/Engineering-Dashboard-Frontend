import type { CSSProperties, ReactNode } from "react";

import { useLiveRegionReady } from "@/hooks/use-live-region-ready";

interface StatusNoticeProps {
  /** The element it renders as, so it keeps the look of the one it replaces. */
  as?: "div" | "p" | "span";
  /** An error: role="alert" with its text exposed at once (an alert is announced when it appears). */
  alert?: boolean;
  className?: string;
  children: ReactNode;
}

// The wrapper makes no box of its own, so the notice lays out exactly as without it.
const SHOWN: CSSProperties = { display: "contents" };
// Takes its space but is not seen or read yet: no layout jump when it is shown.
const NOT_YET: CSSProperties = { display: "contents", visibility: "hidden" };

/**
 * A role="status" notice that is announced even though it appears with its text: the
 * text is hidden (space kept) until the region has been painted (see useLiveRegionReady).
 */
export function StatusNotice({ as: Tag = "div", alert = false, className, children }: StatusNoticeProps) {
  const ready = useLiveRegionReady();
  const Wrapper = Tag === "div" ? "div" : "span";

  return (
    <Tag role={alert ? "alert" : "status"} className={className}>
      <Wrapper style={alert || ready ? SHOWN : NOT_YET}>{children}</Wrapper>
    </Tag>
  );
}
