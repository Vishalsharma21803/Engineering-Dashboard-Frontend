import { useState, type ComponentPropsWithRef } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/utils/cn";

type PasswordInputProps = Omit<
  ComponentPropsWithRef<"input">,
  "type"
>;

export function PasswordInput({
  className,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={isVisible ? "text" : "password"}
        className={cn("pr-16", className)}
      />
      <button
        type="button"
        onClick={() => setIsVisible((visible) => !visible)}
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-2 my-auto h-7 rounded-md px-2 text-xs font-medium text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-indigo-500"
      >
        {isVisible ? "Hide" : "Show"}
      </button>
    </div>
  );
}
