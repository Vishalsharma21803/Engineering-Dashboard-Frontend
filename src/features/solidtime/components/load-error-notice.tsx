import { Button } from "@/components/ui/button";

/** A list behind a picker could not be read: say so, so an empty picker is not taken as "there are none". */
export function LoadErrorNotice({ what, onRetry, isRetrying = false }: { what: string; onRetry: () => void; isRetrying?: boolean }) {
  return (
    <p role="alert" className="flex flex-wrap items-center gap-2 text-xs font-normal text-rose-600">
      {what} could not be loaded.
      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={isRetrying} onClick={onRetry}>
        {isRetrying ? "Retrying..." : "Retry"}
      </Button>
    </p>
  );
}
