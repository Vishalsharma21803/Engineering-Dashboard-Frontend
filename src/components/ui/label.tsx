import type { ComponentPropsWithRef } from "react";

import { cn } from "@/utils/cn";

export function Label({
  className,
  ...props
}: ComponentPropsWithRef<"label">) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-slate-700",
        className
      )}
      {...props}
    />
  );
}
