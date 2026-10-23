import { cn } from "@/utils/cn";
import { Spinner } from "@/components/ui/spinner";

interface PageLoaderProps {
  label?: string;
  fullScreen?: boolean;
}

export function PageLoader({
  label = "Loading...",
  fullScreen = true,
}: PageLoaderProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 text-sm text-slate-500",
        fullScreen ? "min-h-screen" : "min-h-[50vh]"
      )}
      role="status"
    >
      <Spinner className="size-5 text-indigo-600" />
      <span>{label}</span>
    </div>
  );
}
