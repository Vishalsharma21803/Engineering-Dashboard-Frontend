import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorCard, SkeletonRows } from "@/features/azure-devops/components/feedback";
import type { Page } from "@/features/azure-devops/types/azure.types";
import { retryUnlessClientError } from "@/features/azure-devops/utils/query-retry";
import { usePageParam, useSearchParamsUpdate, useSyncServedPage } from "@/hooks/use-page-param";
import { ApiError, apiDownload } from "@/lib/api-client";
import { getAccuracy, weeklyCsvUrl } from "../api/solidtime.api";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { AccuracyRow, SolidtimeConnection } from "../types/solidtime.types";
import { shiftDay, weekStart } from "../utils/time";

function AccuracyTable({ label, page, onPage, busy }: { label: string; page: Page<AccuracyRow>; onPage: (next: number) => void; busy: boolean }) {
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-left text-sm" aria-label={label}>
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 font-medium">{label.replace("Accuracy by ", "")}</th>
              <th className="px-3 py-2 text-right font-medium">Tickets</th>
              <th className="px-3 py-2 text-right font-medium">Tracked</th>
              <th className="px-3 py-2 text-right font-medium">Estimated</th>
              <th className="px-3 py-2 text-right font-medium">Actual ÷ estimate</th>
              <th className="px-3 py-2 text-right font-medium">Over</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {page.items.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2 text-slate-800">{row.label}</td>
                <td className="px-3 py-2 text-right">{row.tickets}</td>
                <td className="px-3 py-2 text-right">{row.trackedHours} h</td>
                <td className="px-3 py-2 text-right">{row.estimateHours} h</td>
                <td className={row.ratio !== null && row.ratio > 1.2 ? "px-3 py-2 text-right font-medium text-rose-700" : "px-3 py-2 text-right"}>{row.ratio ?? "—"}</td>
                <td className="px-3 py-2 text-right">{row.overEstimate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination label={`${label} pages`} page={page.page} totalPages={page.totalPages} total={page.total} pageSize={page.pageSize} disabled={busy} onChange={onPage} />
    </div>
  );
}

/** Estimate accuracy (team when the role allows) and the weekly CSV export. */
export function ReportsTab({ connection, today }: { connection: SolidtimeConnection; today: string }) {
  const [from, setFrom] = useState(shiftDay(today, -29));
  const [to, setTo] = useState(today);
  const [week, setWeek] = useState(weekStart(shiftDay(today, -7)));
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const personPage = usePageParam("personPage");
  const typePage = usePageParam("typePage");
  const updateParams = useSearchParamsUpdate();
  const accuracy = useQuery({
    queryKey: [...solidtimeKeys.accuracy(connection.credentialId), { from, to, personPage: personPage.page, typePage: typePage.page }],
    queryFn: () => getAccuracy(connection.credentialId, { from, to, personPage: personPage.page, typePage: typePage.page }),
    enabled: from <= to,
    placeholderData: keepPreviousData,
    retry: retryUnlessClientError,
  });
  const served = accuracy.data && !accuracy.isPlaceholderData ? accuracy.data : undefined;
  useSyncServedPage(personPage, served?.byPerson.page);
  useSyncServedPage(typePage, served?.byType.page);
  const resetPages = () => updateParams({ personPage: null, typePage: null }, { replace: true });

  async function download() {
    setDownloadError(null);

    try {
      const blob = await apiDownload(weeklyCsvUrl(connection.credentialId, week));
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `time-${week}.csv`;
      link.click();
      // Released after the browser has started the download.
      window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    } catch (error) {
      setDownloadError(error instanceof ApiError ? error.message : "The export could not be downloaded.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="accuracy-title" className="flex flex-col gap-3">
        <h3 id="accuracy-title" className="text-base font-semibold text-slate-950">
          Estimate accuracy {connection.canViewTeam ? "(team)" : "(you)"}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            From
            <Input type="date" className="h-9 w-40" value={from} max={to} onChange={(event) => { if (event.target.value) { setFrom(event.target.value); resetPages(); } }} />
          </label>
          <label className="flex items-center gap-2">
            To
            <Input type="date" className="h-9 w-40" value={to} min={from} onChange={(event) => { if (event.target.value) { setTo(event.target.value); resetPages(); } }} />
          </label>
        </div>
        {accuracy.isLoading ? (
          <SkeletonRows rows={3} />
        ) : accuracy.error || !accuracy.data ? (
          <ErrorCard error={accuracy.error} onRetry={() => void accuracy.refetch()} />
        ) : accuracy.data.byType.total === 0 ? (
          <EmptyState>No tracked tickets with an Azure estimate in this period.</EmptyState>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <AccuracyTable label="Accuracy by person" page={accuracy.data.byPerson} onPage={(next) => personPage.setPage(next)} busy={accuracy.isFetching} />
            <AccuracyTable label="Accuracy by type" page={accuracy.data.byType} onPage={(next) => typePage.setPage(next)} busy={accuracy.isFetching} />
          </div>
        )}
        {accuracy.data?.ticketsWithoutEstimate ? <p className="text-xs text-slate-500">{accuracy.data.ticketsWithoutEstimate} tracked ticket(s) have no original estimate and are left out.</p> : null}
      </section>

      <section aria-labelledby="weekly-title" className="flex flex-col gap-3">
        <h3 id="weekly-title" className="text-base font-semibold text-slate-950">
          Weekly export {connection.canViewTeam ? "(team)" : "(you)"}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Week starting
            <Input type="date" className="h-9 w-40" value={week} onChange={(event) => event.target.value && setWeek(weekStart(event.target.value))} />
          </label>
          <Button size="sm" variant="secondary" onClick={() => void download()}>
            Download CSV
          </Button>
        </div>
        {downloadError ? (
          <p role="alert" className="text-sm text-rose-600">
            {downloadError}
          </p>
        ) : null}
      </section>
    </div>
  );
}
