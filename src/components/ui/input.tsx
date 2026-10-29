import type { ComponentPropsWithRef } from "react";

import { cnMerge as cn } from "@/utils/cn-merge";

export function Input({
  className,
  type = "text",
  ...props
}: ComponentPropsWithRef<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "block h-10 w-full rounded-lg border border-slate-300 bg-surface px-3 text-sm text-slate-950 shadow-xs transition placeholder:text-slate-400 hover:border-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500",
        className
      )}
      {...props}
    />
  );
}
