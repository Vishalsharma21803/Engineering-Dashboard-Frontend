import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Class joining for the shadcn/ui components and the Input and Card
 * primitives: later classes override conflicting earlier ones (so a
 * className prop can replace a default). The rest of the app keeps the
 * plain `cn`.
 */
export function cnMerge(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
