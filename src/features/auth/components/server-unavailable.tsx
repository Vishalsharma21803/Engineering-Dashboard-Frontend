import { Button } from "@/components/ui/button";

interface ServerUnavailableProps {
  onRetry: () => void;
  isRetrying: boolean;
}

/** The session could not be checked: say so and offer a retry, instead of treating it as a sign-out. */
export function ServerUnavailable({ onRetry, isRetrying }: ServerUnavailableProps) {
  return (
    <div
      role="alert"
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <h1 className="text-xl font-semibold tracking-tight text-slate-950">
        Your session could not be checked
      </h1>
      <p className="max-w-md text-sm leading-6 text-slate-600">
        Your session could not be checked because the server did not respond
        or returned an error. You have not been signed out.
      </p>
      <Button variant="secondary" onClick={onRetry} disabled={isRetrying}>
        {isRetrying ? "Retrying..." : "Retry"}
      </Button>
    </div>
  );
}
