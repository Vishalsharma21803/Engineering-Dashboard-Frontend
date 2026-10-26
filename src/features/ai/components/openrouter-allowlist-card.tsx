import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useOpenRouterAllowlist, useSetOpenRouterAllowlist } from "../hooks/use-ai";
import type { AiModelOption } from "../types/ai.types";
import { formatPrice } from "../utils/ai-display";
import { describeAiError } from "../utils/ai-errors";

/** SOP owners choose which OpenRouter models everyone may pick. None selected = all JSON-capable models. */
export function OpenRouterAllowlistCard() {
  const allowlist = useOpenRouterAllowlist();

  return (
    <Card className="p-5">
      <h3 className="text-base font-semibold text-slate-950">OpenRouter models offered (SOP owner)</h3>
      <p className="mt-1 text-sm text-slate-600">
        Pick the models your team may use. With nothing selected, every model that can return structured JSON is offered.
      </p>

      {allowlist.isLoading ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
          <Spinner className="size-4" /> Loading models…
        </p>
      ) : allowlist.isError || !allowlist.data ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {describeAiError(allowlist.error, "Could not load OpenRouter models.")}
        </p>
      ) : (
        <AllowlistEditor initialIds={allowlist.data.modelIds} options={allowlist.data.models} />
      )}
    </Card>
  );
}

function AllowlistEditor({ initialIds, options }: { initialIds: string[]; options: AiModelOption[] }) {
  const save = useSetOpenRouterAllowlist();
  const [selected, setSelected] = useState<string[]>(initialIds);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const visible = options.filter((model) => `${model.id} ${model.label}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <input
        aria-label="Filter models"
        placeholder="Filter models…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
        className="mt-3 block h-9 w-full rounded-lg border border-slate-300 px-3 text-sm"
      />
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
        {visible.map((model) => (
          <li key={model.id}>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.includes(model.id)}
                onChange={(event) =>
                  setSelected(event.target.checked ? [...selected, model.id] : selected.filter((id) => id !== model.id))
                }
              />
              <span className="font-mono text-xs text-slate-700">{model.id}</span>
              <span className="text-xs text-slate-500">· {formatPrice(model)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="sm"
          disabled={save.isPending}
          onClick={() =>
            save.mutate(selected, {
              onSuccess: (saved) => setMessage(saved.length ? `${saved.length} models allowed.` : "All JSON-capable models allowed."),
              onError: (error) => setMessage(describeAiError(error, "Could not save.")),
            })
          }
        >
          Save model list
        </Button>
        <span className="text-xs text-slate-500">{selected.length} selected</span>
        {message ? <span className="text-sm text-slate-700">{message}</span> : null}
      </div>
    </>
  );
}
