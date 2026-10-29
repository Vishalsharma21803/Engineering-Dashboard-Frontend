import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SelectField } from "@/components/ui/select-field";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/utils/cn";
import { getRulebookVersion, validateRulebook } from "../api/sop.api";
import { useRulebookVersions, useSaveRulebook } from "../hooks/use-sop";
import type { RulebookContent, RulebookScope, RuleProblem, ValidationResult } from "../types/sop.types";
import { RuleSummaryTable } from "./rule-summary-table";
import { TestOnTicket } from "./test-on-ticket";

interface RulebookEditorProps {
  scope: RulebookScope;
  initial: RulebookContent;
  canSave: boolean;
  /** Shown above the editor when the user can only read. */
  readOnlyReason?: string;
  placeholder?: string;
}

const VALIDATE_DELAY_MS = 600;

function lineOf(problem: RuleProblem): number | null {
  const match = /^line (\d+)$/.exec(problem.field);
  return match?.[1] ? Number(match[1]) : null;
}

/** Markdown rule-card editor: live validation with line numbers, versions, import/export. */
export function RulebookEditor({ scope, initial, canSave, readOnlyReason, placeholder }: RulebookEditorProps) {
  const [content, setContent] = useState(initial.content);
  const [note, setNote] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  /** The live check could not reach the server (saving still checks the rules). */
  const [validationFailed, setValidationFailed] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [saveErrors, setSaveErrors] = useState<RuleProblem[]>([]);
  /** Read-only rulebooks open on the readable rule list; editable ones on the editor. */
  const [view, setView] = useState<"rules" | "markdown">(canSave ? "markdown" : "rules");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const versions = useRulebookVersions(scope);
  const save = useSaveRulebook(scope);

  useEffect(() => {
    // An older response must not overwrite the result for newer text (it could enable Save wrongly).
    let current = true;
    const timer = window.setTimeout(() => {
      setValidating(true);
      validateRulebook(scope, content)
        .then((result) => {
          if (current) {
            setValidation(result);
            setValidationFailed(false);
          }
        })
        .catch(() => {
          if (current) {
            setValidation(null);
            setValidationFailed(true);
          }
        })
        .finally(() => current && setValidating(false));
    }, VALIDATE_DELAY_MS);

    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [scope, content]);

  const problems = saveErrors.length > 0 ? saveErrors : (validation?.errors ?? []);
  const lineCount = Math.max(content.split("\n").length, 1);
  const dirty = content !== initial.content;

  function jumpToLine(line: number) {
    const textarea = textareaRef.current;

    if (!textarea) {
      return;
    }

    const offset = content.split("\n").slice(0, line - 1).reduce((total, text) => total + text.length + 1, 0);
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    textarea.scrollTop = Math.max(0, (line - 3) * 20);
  }

  function handleSave() {
    setMessage(null);
    setSaveErrors([]);
    save.mutate(
      { content, ...(note.trim() ? { note: note.trim() } : {}) },
      {
        onSuccess: (saved) => {
          setNote("");
          setMessage({ tone: "success", text: `Saved as version ${saved.version}.` });
        },
        onError: (error) => {
          if (error instanceof ApiError && error.errors.length > 0) {
            setSaveErrors(error.errors);
          }
          setMessage({ tone: "error", text: error instanceof ApiError ? error.message : "Could not save." });
        },
      }
    );
  }

  async function loadVersion(version: number) {
    try {
      const old = await getRulebookVersion(scope, version);
      setContent(old.content);
      setSaveErrors([]);
      setMessage({ tone: "success", text: `Loaded version ${version} into the editor. Save to restore it as a new version.` });
    } catch {
      setMessage({ tone: "error", text: "Could not load that version." });
    }
  }

  function exportFile() {
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = scope === "default" ? "sop-rulebook.md" : "my-sop-rules.md";
    link.click();
    // Revoking right away can cancel the download in some browsers.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (file) {
      setContent(await file.text());
      setSaveErrors([]);
      setMessage({ tone: "success", text: `Imported ${file.name}. Review it, then save.` });
    }
  }

  const cardCount = validation?.summary.cards.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700">
              Version {initial.version}
              {initial.version === 0 && scope === "default" ? " · built-in starter" : ""}
            </span>
            {initial.createdBy ? <span className="text-xs text-slate-500">saved by {initial.createdBy}</span> : null}
            {dirty ? <span className="text-xs font-medium text-amber-700">Unsaved changes</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`versions-${scope}`}>
              Load a version
            </label>
            <SelectField
              id={`versions-${scope}`}
              size="sm"
              className="w-40 sm:w-48"
              value=""
              onValueChange={(selected) => selected && void loadVersion(Number(selected))}
            >
              <option value="">{versions.isLoading ? "Loading history…" : versions.error ? "History could not be loaded" : "History…"}</option>
              {(versions.data ?? []).map((version) => (
                <option key={version.version} value={version.version}>
                  v{version.version}
                  {version.note ? ` — ${version.note}` : ""}
                  {version.createdAt ? ` (${new Date(version.createdAt).toLocaleString()})` : ""}
                </option>
              ))}
            </SelectField>
            <Button size="sm" variant="secondary" onClick={exportFile}>
              Export .md
            </Button>
            {canSave ? (
              <>
                <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
                  Import .md
                </Button>
                <input ref={fileRef} type="file" accept=".md,text/markdown,text/plain" className="hidden" onChange={(event) => void importFile(event)} />
              </>
            ) : null}
            {dirty && canSave ? (
              <Button size="sm" variant="ghost" onClick={() => { setContent(initial.content); setSaveErrors([]); }}>
                Discard changes
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {readOnlyReason ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{readOnlyReason}</p>
          ) : null}

          <div role="group" aria-label="View" className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            {(["rules", "markdown"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition",
                  view === value ? "bg-inverse text-on-inverse shadow-sm" : "text-slate-600 hover:text-slate-950"
                )}
              >
                {value === "rules" ? `Rules (${cardCount})` : canSave ? "Edit Markdown" : "Markdown"}
              </button>
            ))}
          </div>

          {view === "rules" ? (
            validation && cardCount > 0 ? (
              <RuleSummaryTable cards={validation.summary.cards} />
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
                {validating ? "Reading the rules…" : content.trim() === "" ? "No rules yet." : "No rules to show. Fix the problems in Markdown first."}
                {canSave && !validating ? (
                  <>
                    {" "}
                    <button type="button" className="font-medium text-indigo-700 hover:underline" onClick={() => setView("markdown")}>
                      Open the editor
                    </button>
                  </>
                ) : null}
              </p>
            )
          ) : (
            <div className="flex overflow-hidden rounded-lg border border-slate-300 bg-surface shadow-sm focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/20">
              <div
                ref={gutterRef}
                aria-hidden="true"
                className="h-[32rem] select-none overflow-hidden border-r border-slate-100 bg-slate-50 px-2 py-2 text-right font-mono text-xs leading-5 text-slate-400"
              >
                {Array.from({ length: lineCount }, (_, index) => (
                  <div key={index} className={cn(problems.some((problem) => lineOf(problem) === index + 1) && "font-bold text-rose-600")}>
                    {index + 1}
                  </div>
                ))}
              </div>
              <textarea
                ref={textareaRef}
                aria-label={scope === "default" ? "Default rulebook" : "My rules"}
                value={content}
                readOnly={!canSave}
                spellCheck={false}
                placeholder={placeholder}
                onChange={(event) => { setContent(event.target.value); setSaveErrors([]); }}
                onScroll={(event) => {
                  if (gutterRef.current) {
                    gutterRef.current.scrollTop = event.currentTarget.scrollTop;
                  }
                }}
                className="h-[32rem] flex-1 resize-none bg-transparent px-3 py-2 font-mono text-xs leading-5 text-slate-900 outline-none placeholder:italic placeholder:text-slate-400"
              />
            </div>
          )}

          {problems.length > 0 ? (
            <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
              {problems.map((problem, index) => {
                const line = lineOf(problem);
                return (
                  <li key={index}>
                    {line ? (
                      <button type="button" className="font-mono font-semibold underline-offset-2 hover:underline" onClick={() => { setView("markdown"); window.setTimeout(() => jumpToLine(line), 0); }}>
                        Line {line}
                      </button>
                    ) : (
                      <span className="font-semibold">{problem.field}</span>
                    )}
                    : {problem.message}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-h-5 flex-wrap items-center gap-3 text-sm">
            {validating ? (
              <span className="flex items-center gap-1.5 text-slate-500">
                <Spinner className="size-3.5" /> Checking…
              </span>
            ) : problems.length === 0 && content.trim() === "" ? (
              <span className="text-slate-500">Empty — add a rule card</span>
            ) : problems.length === 0 && validation ? (
              <span className="font-medium text-emerald-700">
                ✓ Valid · {validation.summary.cards.length} rules
                {scope === "default" ? "" : ` · ${validation.summary.overrides.length} overrides`}
              </span>
            ) : problems.length > 0 ? (
              <span className="font-medium text-rose-600">
                {problems.length} problem{problems.length === 1 ? "" : "s"} to fix before saving
              </span>
            ) : validationFailed ? (
              <span role="alert" className="text-amber-700">
                Could not check the rules right now; they are checked again when you save.
              </span>
            ) : null}
            {message ? (
              <span role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? "text-rose-600" : "text-emerald-700"}>
                {message.text}
              </span>
            ) : null}
          </div>

          {canSave ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {scope === "default" ? (
                <Input aria-label="Change note" placeholder="What changed? (optional)" value={note} onChange={(event) => setNote(event.target.value)} className="h-9 sm:w-64" />
              ) : null}
              <Button disabled={!dirty || problems.length > 0 || validating || save.isPending} onClick={handleSave}>
                {save.isPending ? <Spinner className="size-4" /> : null}
                Save as new version
              </Button>
            </div>
          ) : null}
        </div>
      </Card>

      {/* Only people who can save a rulebook may test unsaved versions of it. */}
      <TestOnTicket scope={scope} content={content} allowDraft={canSave} />
    </div>
  );
}
