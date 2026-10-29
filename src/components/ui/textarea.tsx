import * as React from "react"

import { cnMerge as cn } from "@/utils/cn-merge"

/** shadcn/ui Textarea, styled like the app's Input. Height comes from rows / min-h (no auto-grow). */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "block min-h-16 w-full rounded-lg border border-slate-300 bg-surface px-3 py-2 text-sm text-slate-950 shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-slate-400 hover:border-slate-400 focus-visible:border-indigo-500 focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
