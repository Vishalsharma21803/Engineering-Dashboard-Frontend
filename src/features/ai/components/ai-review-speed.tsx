import { Button } from "@/components/ui/button";
import { useSopCheckTiming } from "../hooks/use-ai";
import type { AiProvider } from "../types/ai.types";

/** Above this, opening a ticket feels slow while its AI review runs. */
const SLOW_SECONDS = 30;

/**
 * How fast the chosen model reviews a ticket (time running, not waiting in
 * the queue), from the user's own reviews, with a hint when it is slow or
 * often rate limited. Nothing is shown before the first review.
 */
export function AiReviewSpeed({ provider, model }: { provider: AiProvider | null; model: string | null }) {
  const timing = useSopCheckTiming();
  const stats = timing.data?.models.find((entry) => entry.provider === provider && entry.model === model);

  // A failed read is not "no reviews yet": say so instead of showing nothing.
  if (model && timing.isError && !timing.data) {
    return (
      <div className="border-b border-slate-200 px-5 py-3 text-sm" aria-label="AI review speed">
        <p role="alert" className="flex flex-wrap items-center gap-2 text-rose-600">
          Review speed could not be loaded.
          <Button size="sm" variant="ghost" disabled={timing.isFetching} onClick={() => void timing.refetch()}>
            {timing.isFetching ? "Retrying..." : "Retry"}
          </Button>
        </p>
      </div>
    );
  }

  if (!model || !stats || (stats.checks === 0 && stats.rateLimited === 0)) {
    return null;
  }

  const slow = (stats.averageSeconds ?? 0) > SLOW_SECONDS;

  return (
    <div className="border-b border-slate-200 px-5 py-3 text-sm" aria-label="AI review speed">
      <p className="text-slate-700">
        {stats.averageSeconds !== null ? (
          <>
            Ticket reviews with this model take <span className="font-semibold text-slate-950">{stats.averageSeconds} s</span> on average (slowest {stats.maxSeconds} s,{" "}
            {stats.checks} {stats.checks === 1 ? "review" : "reviews"} in the last {timing.data?.days} days).
          </>
        ) : (
          <>No finished ticket reviews with this model in the last {timing.data?.days} days.</>
        )}
        {stats.rateLimited > 0 ? ` ${stats.rateLimited} waited on the provider's rate limit.` : ""}
      </p>
      {slow || stats.rateLimited > 0 ? (
        <p className="mt-1 text-xs text-amber-700">
          {slow ? "This model is slow for ticket reviews. " : ""}
          {stats.rateLimited > 0 ? "Free models have small rate limits. " : ""}A faster or paid model makes the review on the ticket page arrive sooner; code results never wait for it.
        </p>
      ) : null}
    </div>
  );
}
