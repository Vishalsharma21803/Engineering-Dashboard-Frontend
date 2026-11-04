import type { Attention, ComplianceResult, WorkItemSummary } from "../../types/azure.types";
import { pluralizeText } from "../../utils/format";

export interface Problem {
  tone: "danger" | "warning" | "neutral";
  /** In full, for the hint (the ticket page lists each SOP gap with its fix). */
  text: string;
  /** Short tag on the row; SOP gaps share one tag. */
  tag: string;
  sop?: boolean;
}

const STALE_REASON = /^No updates in (\d+) working days$/;
const NO_TIME_REASON = /tracked no time|no time tracked/i;
const plain = (text: string) => text.replace(/\.$/, "");

/** A ticket's problems, most serious first (blocked and overdue before missing steps). Every reason is kept. */
export function problemsOf(item: WorkItemSummary, compliance: ComplianceResult | null, attention: Attention | null): Problem[] {
  const gaps = compliance?.configured ? compliance.violations : [];
  const reasons = (attention?.reasons ?? []).map(pluralizeText);
  const problems: Problem[] = [];
  if (item.blocked) problems.push({ tone: "danger", text: "Blocked", tag: "Blocked" });
  for (const reason of reasons) {
    if (/^Overdue/i.test(reason)) problems.push({ tone: "danger", text: reason, tag: "Overdue" });
    else if (/^Due /i.test(reason)) problems.push({ tone: "warning", text: reason, tag: "Due soon" });
  }
  for (const gap of gaps) problems.push({ tone: "warning", text: plain(pluralizeText(gap.message)), tag: "SOP", sop: true });
  const stale = reasons.map((reason) => STALE_REASON.exec(reason)).find(Boolean);
  if (stale) problems.push({ tone: "neutral", text: `No update for ${stale[1]} days`, tag: `No update ${stale[1]}d` });
  // A time reminder on the ticket. (Its other reasons are SOP gaps, shown from its SOP result above, which may be newer.)
  const noTime = reasons.find((reason) => NO_TIME_REASON.test(reason));
  if (noTime) problems.push({ tone: "neutral", text: plain(noTime), tag: "No time today" });
  return problems;
}
