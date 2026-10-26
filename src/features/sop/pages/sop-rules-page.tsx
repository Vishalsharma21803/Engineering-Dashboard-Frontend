import { useState } from "react";

import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ErrorCard } from "@/features/azure-devops/components/feedback";
import { cn } from "@/utils/cn";
import { RuleSummaryTable } from "../components/rule-summary-table";
import { RulebookEditor } from "../components/rulebook-editor";
import { useEffectiveRules, useRulebook } from "../hooks/use-sop";
import type { RulebookScope } from "../types/sop.types";

type Tab = RulebookScope | "effective";

const PERSONAL_PLACEHOLDER = `Your rules change only your own checks. Examples:

---
id: DEV-01
severity: off
---

---
id: MY-01
title: Bugs name the browser
checker: ai
applies_to: [bug]
when: always
severity: warn
---
**Rule:** Every bug says which browser and version it was found in.

**Passes when:** The description or a comment names a browser and version.

**Fails when:** No browser is mentioned.`;

function EditorTab({ scope, canSave, readOnlyReason }: { scope: RulebookScope; canSave: boolean; readOnlyReason?: string }) {
  const rulebook = useRulebook(scope);

  if (rulebook.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading rules…
      </p>
    );
  }

  if (rulebook.error || !rulebook.data) {
    return <ErrorCard error={rulebook.error} onRetry={() => void rulebook.refetch()} />;
  }

  return (
    <RulebookEditor
      // Not keyed by version: after a save the editor already holds the saved text, and remounting would hide the "Saved" message.
      scope={scope}
      initial={rulebook.data}
      canSave={canSave}
      {...(readOnlyReason ? { readOnlyReason } : {})}
      {...(scope === "personal" ? { placeholder: PERSONAL_PLACEHOLDER } : {})}
    />
  );
}

function EffectiveTab() {
  const effective = useEffectiveRules();

  if (effective.isLoading) {
    return <Spinner className="size-4" />;
  }

  if (effective.error || !effective.data) {
    return <ErrorCard error={effective.error} onRetry={() => void effective.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Default rules v{effective.data.defaultVersion} + your rules v{effective.data.personalVersion}. Team reports always use
        the default rules only.
      </p>
      {effective.data.issues.length > 0 ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {effective.data.issues.map((issue, index) => (
            <li key={index}>
              Your rules, {issue.field}: {issue.message} (ignored)
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-slate-600">
        Configured projects:{" "}
        {effective.data.projects.length ? effective.data.projects.map((project) => project.project).join(", ") : "none"}
        . Projects without facts in the default rules are not checked.
      </p>
      <RuleSummaryTable cards={effective.data.cards} />
    </div>
  );
}

export function SopRulesPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("personal");
  const isOwner = user?.isSopAdmin ?? false;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "personal", label: "My rules" },
    { id: "default", label: "Default rules" },
    { id: "effective", label: "Rules that apply to me" },
  ];

  return (
    <section className="flex w-full flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">SOP</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">SOP rules</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Rules are Markdown "rule cards". Code rules are fixed built-in checks you can tune; AI rules are plain English judged by
          your AI model. The default rules are set by SOP owners; your own rules only change your checks.
        </p>
      </div>

      <div role="tablist" className="flex gap-1 border-b border-slate-200">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition",
              tab === item.id ? "border-indigo-600 text-indigo-700" : "border-transparent text-slate-600 hover:text-slate-950"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "personal" ? <EditorTab scope="personal" canSave /> : null}
      {tab === "default" ? (
        <EditorTab
          scope="default"
          canSave={isOwner}
          {...(isOwner ? {} : { readOnlyReason: "Only SOP owners can change the default rules. Copy a rule id into My rules to adjust it for yourself." })}
        />
      ) : null}
      {tab === "effective" ? <EffectiveTab /> : null}
    </section>
  );
}
