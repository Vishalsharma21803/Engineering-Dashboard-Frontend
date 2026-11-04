import { useState } from "react";

import { ActiveIndicator } from "@/components/ui/active-indicator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ErrorCard, StatTile } from "@/features/azure-devops/components/feedback";
import { ProjectsTab } from "../components/projects-tab";
import { RuleSummaryTable } from "../components/rule-summary-table";
import { RulebookEditor } from "../components/rulebook-editor";
import { RulesList } from "../components/rules-list";
import { useEffectiveRules, useRulebook, useRulesList } from "../hooks/use-sop";
import type { RulebookScope } from "../types/sop.types";
import { rulebookVersionsLabel } from "../utils/rule-labels";

type Tab = RulebookScope | "effective" | "projects";

const TABS: Array<{ id: Tab; label: string; description: string }> = [
  { id: "projects", label: "Projects", description: "Set up how each Azure DevOps project maps onto the SOP, and choose which projects are checked for you." },
  { id: "personal", label: "My rules", description: "Your own rule cards and changes to default rules. They only change your checks, never the team's." },
  { id: "default", label: "Default rules", description: "The organization's rules, kept by SOP owners. Team reports use these." },
  { id: "effective", label: "Rules that apply to me", description: "The default rules with your changes applied: exactly what your checks use." },
];

function isTab(value: string | null): value is Tab {
  return TABS.some((tab) => tab.id === value);
}

const PERSONAL_PLACEHOLDER = `Example only (start typing to replace it). Your rules change only your own checks:

---
id: DEV-02
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
    return <ErrorCard error={rulebook.error} onRetry={() => void rulebook.refetch()} isRetrying={rulebook.isFetching} />;
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

const DEFAULT_READ_ONLY = "Only SOP owners can change the default rules.";

/**
 * "My rules" and "Default rules": the rules list first; the Markdown editor
 * stays under Advanced (import/export, history, bulk edits) and is only
 * mounted while open, so the page does not load and validate it unasked.
 */
function RulesTab({ scope, isOwner }: { scope: RulebookScope; isOwner: boolean }) {
  const list = useRulesList();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The editor keeps its own copy of the text; a change saved from the list restarts it from the new version.
  const [editorKey, setEditorKey] = useState(0);

  if (list.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading rules…
      </p>
    );
  }

  if (list.error || !list.data) {
    return <ErrorCard error={list.error} onRetry={() => void list.refetch()} isRetrying={list.isFetching} />;
  }

  const editable = scope === "personal" || list.data.canEditDefaults;

  return (
    <div className="flex flex-col gap-5">
      {!editable ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{DEFAULT_READ_ONLY}</p>
      ) : null}

      {scope === "personal" && list.data.issues.length > 0 ? (
        <ul className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {list.data.issues.map((issue, index) => (
            <li key={index}>
              Your rules, {issue.field}: {issue.message} (ignored)
            </li>
          ))}
        </ul>
      ) : null}

      <RulesList
        scope={scope}
        rules={scope === "personal" ? list.data.rules : list.data.defaultRules}
        checks={list.data.checks}
        editable={editable}
        baseVersion={scope === "personal" ? list.data.personalVersion : list.data.defaultVersion}
        onSaved={() => setEditorKey((key) => key + 1)}
      />

      <details open={advancedOpen} onToggle={(event) => setAdvancedOpen(event.currentTarget.open)} className="rounded-xl border border-slate-200 bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium text-slate-800">
          Advanced: {scope === "default" && !isOwner ? "view as Markdown" : "edit as Markdown"}
        </summary>
        {advancedOpen ? (
          <div className="mt-4">
            {scope === "personal" ? (
              <EditorTab key={editorKey} scope="personal" canSave />
            ) : (
              <EditorTab
                key={editorKey}
                scope="default"
                canSave={isOwner}
                {...(isOwner ? {} : { readOnlyReason: `${DEFAULT_READ_ONLY} Copy a rule id into My rules to adjust it for yourself.` })}
              />
            )}
          </div>
        ) : null}
      </details>
    </div>
  );
}

function EffectiveTab() {
  const effective = useEffectiveRules();

  if (effective.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4" /> Loading your rules…
      </p>
    );
  }

  if (effective.error || !effective.data) {
    return <ErrorCard error={effective.error} onRetry={() => void effective.refetch()} isRetrying={effective.isFetching} />;
  }

  const cards = effective.data.cards;
  const active = cards.filter((card) => card.severity !== "off");

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Rules in force" value={active.length} hint={`${cards.length - active.length} switched off`} />
        <StatTile label="Gaps" value={cards.filter((card) => card.severity === "fail").length} hint="must be fixed" />
        <StatTile label="Warnings & notices" value={cards.filter((card) => card.severity === "warn" || card.severity === "notice").length} hint="shown, not blocking" />
        <StatTile label="Projects checked" value={effective.data.projects.length} hint={effective.data.projects.map((project) => project.project).join(", ") || "set them up on Projects"} />
      </div>

      <p className="rounded-lg border border-slate-200 bg-surface px-4 py-3 text-sm text-slate-600">
        {rulebookVersionsLabel(effective.data.defaultVersion, effective.data.personalVersion)}. Team reports always use the default rules only.
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

      <RuleSummaryTable cards={cards} />
    </div>
  );
}

export function SopRulesPage() {
  const { user } = useAuth();
  // The tab lives in the URL (?tab=projects) so other pages can link to it; anything unknown is "My rules".
  const [tab, setTab] = useUrlTab(isTab, "personal", { replace: true });
  const isOwner = user?.isSopAdmin ?? false;

  return (
    <section className="flex w-full min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">SOP rules</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
          Rules say what each ticket needs at each stage. Something missing while the ticket is still in that stage is a to-do; once
          the ticket moves on it becomes a gap. When you open a ticket, your AI model double-checks the findings and can draft fixes
          for you to approve. SOP owners set the default rules; your own changes affect only your checks.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(value) => isTab(value) && setTab(value)} className="gap-6">
        <TabsList variant="line">
          <ActiveIndicator variant="underline" />
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="flex min-w-0 flex-col gap-6">
          <p className="-mt-2 text-sm text-slate-600">{TABS.find((item) => item.id === tab)?.description}</p>

          {tab === "projects" ? <ProjectsTab /> : null}
          {tab === "personal" ? <RulesTab scope="personal" isOwner={isOwner} /> : null}
          {tab === "default" ? <RulesTab scope="default" isOwner={isOwner} /> : null}
          {tab === "effective" ? <EffectiveTab /> : null}
        </TabsContent>
      </Tabs>
    </section>
  );
}
