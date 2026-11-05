import { X } from "lucide-react";
import { useState } from "react";

import { modKey } from "@/utils/platform";
import { readStored, writeStored } from "../utils/stored";

const KEY = "relay:tips-dismissed";

const TIPS = [
  { title: "Your sprint at a glance", text: "The bar shows how much of your work is finished; the tick is today. Hours left are compared with the working hours you have left." },
  { title: "Problems sit on the ticket", text: "A warning on a row says what is missing. Fix… proposes the change, and nothing is written to Azure DevOps until you approve it." },
  { title: "Find anything fast", text: `Press ${modKey}K to jump to any of your tickets or pull requests, and J / K to move through the list.` },
];

/** Three short tips on the first visit; dismissed once, remembered in this browser. */
export function GettingStarted() {
  const [dismissed, setDismissed] = useState(() => readStored<boolean>(KEY, false));
  if (dismissed) return null;

  return (
    <section aria-label="Getting started" className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-950">New here? Three things to know</h2>
        <button
          type="button"
          onClick={() => {
            setDismissed(true);
            writeStored(KEY, true);
          }}
          className="-mr-2 -mt-1 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 outline-none hover:bg-indigo-100 focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Got it
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
      <ol className="mt-3 grid gap-4 sm:grid-cols-3">
        {TIPS.map((tip, index) => (
          <li key={tip.title} className="flex gap-3">
            <span aria-hidden="true" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[11px] font-semibold text-white">
              {index + 1}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block font-medium text-slate-900">{tip.title}</span>
              <span className="block text-slate-600">{tip.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
