import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { refreshSolidtime, timerRecheckInterval } from "../hooks/use-solidtime";
import { solidtimeKeys } from "../api/solidtime.keys";
import type { Timer, Timesheet } from "../types/solidtime.types";
import { countsRunningTimer, liveTimesheet, sheetDisagreesWithTimer } from "../utils/live-timesheet";
import { checkedLabel } from "../utils/time";

const start = "2026-11-05T09:00:00Z";
const readAt = Date.parse(start) + 600_000; // the sheet was read 10 min into the timer
const page = <T,>(items: T[]) => ({ items, total: items.length, page: 1, pageSize: 10, totalPages: 1 });
const entry = { id: "run", start, end: null, seconds: 600, running: true, description: "#101 #102 Pairing", projectId: null, projectName: null, taskId: null, tags: [], billable: false, tickets: [] };

function sheet(running: Timesheet["running"]): Timesheet {
  return {
    from: "2026-11-02",
    to: "2026-11-08",
    timeZone: "UTC",
    totalSeconds: 3600 + 600,
    days: [
      { day: "2026-11-04", seconds: 3600 },
      { day: "2026-11-05", seconds: 600 },
    ],
    byTicket: page([
      { ticketId: 101, title: "A", seconds: 300 },
      { ticketId: 102, title: "B", seconds: 300 },
      { ticketId: 103, title: "C", seconds: 3600 },
    ]),
    unlinkedSeconds: 0,
    entries: page([entry]),
    running,
    ticketsChecked: true,
    truncated: false,
  };
}

const running = { id: "run", start, day: "2026-11-05", seconds: 600, ticketIds: [101, 102] };
const timerOn = (id = "run", inThisOrganization = true): Timer =>
  ({ entry: { id, start }, inThisOrganization, tickets: [] }) as unknown as Timer;

describe("live timesheet", () => {
  it("counts the running timer up to now: on its start day, split between its tickets", () => {
    const live = liveTimesheet(sheet(running), timerOn(), readAt + 120_000, readAt);

    expect(live.totalSeconds).toBe(4200 + 120);
    expect(live.daySeconds({ day: "2026-11-05", seconds: 600 })).toBe(720);
    expect(live.daySeconds({ day: "2026-11-04", seconds: 3600 })).toBe(3600);
    expect(live.ticketSeconds({ ticketId: 101, seconds: 300 })).toBe(360);
    expect(live.ticketSeconds({ ticketId: 103, seconds: 3600 })).toBe(3600);
    expect(live.unlinkedSeconds).toBe(0);
    expect(live.entrySeconds(entry)).toBe(720);
  });

  it("counts a timer without tickets as not linked", () => {
    const live = liveTimesheet(sheet({ ...running, ticketIds: [] }), timerOn(), readAt + 60_000, readAt);
    expect(live.unlinkedSeconds).toBe(60);
  });

  it("never counts below what the server counted (a browser clock behind the server's)", () => {
    const live = liveTimesheet(sheet(running), timerOn(), readAt - 30_000, readAt);
    expect(live.totalSeconds).toBe(4200);
  });

  it("stops counting when the timer check says it stopped or another one runs, holding (not dropping) until the sheet is read again", () => {
    expect(countsRunningTimer(sheet(running), null)).toBe(false);
    expect(countsRunningTimer(sheet(running), timerOn("other"))).toBe(false);
    // Checked 1 min after the sheet was read: it held at that minute, two minutes later.
    expect(liveTimesheet(sheet(running), null, readAt + 180_000, readAt + 60_000).totalSeconds).toBe(4200 + 60);
    // A check older than the sheet adds nothing to it.
    expect(liveTimesheet(sheet(running), null, readAt + 180_000, readAt - 60_000).totalSeconds).toBe(4200);
    expect(countsRunningTimer(sheet(running), undefined)).toBe(true);
    expect(countsRunningTimer(sheet(null), timerOn())).toBe(false);
  });

  it("disagrees with the timer check only when the sheet would be wrong", () => {
    expect(sheetDisagreesWithTimer(sheet(running), undefined)).toBe(false);
    expect(sheetDisagreesWithTimer(sheet(running), timerOn())).toBe(false);
    // Stopped or swapped in Solidtime.
    expect(sheetDisagreesWithTimer(sheet(running), null)).toBe(true);
    expect(sheetDisagreesWithTimer(sheet(running), timerOn("other"))).toBe(true);
    // Started in this period, but not in the sheet yet.
    expect(sheetDisagreesWithTimer(sheet(null), timerOn())).toBe(true);
    // Nothing of this sheet: another organization, or started before the period.
    expect(sheetDisagreesWithTimer(sheet(null), timerOn("run", false))).toBe(false);
    expect(sheetDisagreesWithTimer({ ...sheet(null), from: "2026-11-09", to: "2026-11-15" }, timerOn())).toBe(false);
    expect(sheetDisagreesWithTimer(sheet(null), null)).toBe(false);
    // A cut-off sheet may just not have reached the timer: not a reason to reload on every check.
    expect(sheetDisagreesWithTimer({ ...sheet(null), truncated: true }, timerOn())).toBe(false);
  });
});

describe("timer checks", () => {
  it("re-checks every 5 minutes only while a timer runs", () => {
    expect(timerRecheckInterval(timerOn())).toBe(300_000);
    expect(timerRecheckInterval(null)).toBe(false);
    expect(timerRecheckInterval(undefined)).toBe(false);
  });

  it("says how long ago Solidtime was checked", () => {
    const at = Date.parse("2026-11-05T10:00:00Z");
    expect(checkedLabel(at, at + 30_000)).toBe("Checked just now");
    expect(checkedLabel(at, at + 4 * 60_000)).toBe("Checked 4 min ago");
    expect(checkedLabel(at, at + 2 * 3600_000)).toMatch(/^Checked at /);
  });

  it("Refresh reloads the connection's Solidtime views, but never the draft (it would replace my edits)", async () => {
    const client = new QueryClient();
    const id = "c1";
    for (const key of [solidtimeKeys.timer(id), solidtimeKeys.timesheet(id), solidtimeKeys.catalog(id), solidtimeKeys.draft(id, "2026-11-05"), solidtimeKeys.timesheet("other")]) {
      client.setQueryData(key, {});
    }

    await refreshSolidtime(client, id);

    const invalidated = (key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated;
    expect(invalidated(solidtimeKeys.timer(id))).toBe(true);
    expect(invalidated(solidtimeKeys.timesheet(id))).toBe(true);
    expect(invalidated(solidtimeKeys.catalog(id))).toBe(true);
    expect(invalidated(solidtimeKeys.draft(id, "2026-11-05"))).toBe(false);
    expect(invalidated(solidtimeKeys.timesheet("other"))).toBe(false);
  });
});
