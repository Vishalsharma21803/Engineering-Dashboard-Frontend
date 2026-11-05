import type { Timer, Timesheet, TimesheetEntry } from "../types/solidtime.types";
import { localDay } from "./time";

export interface LiveTimesheet {
  totalSeconds: number;
  unlinkedSeconds: number;
  daySeconds: (day: { day: string; seconds: number }) => number;
  ticketSeconds: (ticket: { ticketId: number; seconds: number }) => number;
  entrySeconds: (entry: TimesheetEntry) => number;
}

/** The sheet has a running timer and the timer check agrees (or has not answered yet). */
export function countsRunningTimer(sheet: Timesheet, timer: Timer | null | undefined): boolean {
  const running = sheet.running ?? null;
  return running !== null && (timer === undefined || (timer !== null && timer.entry.id === running.id));
}

/**
 * The sheet's numbers with the running timer counted up to `now`, the way the server counts it: all of it on the
 * day it started, split evenly between the tickets it names, or "not linked" when it names none.
 * It counts on while the timer check agrees (or has not answered yet). Once the check says it stopped (or another
 * one runs), it holds at the time of that check instead of dropping back, until the sheet is read again.
 */
export function liveTimesheet(sheet: Timesheet, timer: Timer | null | undefined, now: number, timerReadAt: number): LiveTimesheet {
  const running = sheet.running ?? null;
  const until = countsRunningTimer(sheet, timer) ? now : Math.min(now, timerReadAt);
  // Never below what the server counted (the browser's clock may be behind the server's).
  const extra = running ? Math.max(0, Math.round((until - Date.parse(running.start)) / 1000) - running.seconds) : 0;
  const tickets = running?.ticketIds ?? [];

  return {
    totalSeconds: sheet.totalSeconds + extra,
    unlinkedSeconds: sheet.unlinkedSeconds + (tickets.length === 0 ? extra : 0),
    daySeconds: (day) => day.seconds + (day.day === running?.day ? extra : 0),
    ticketSeconds: (ticket) => Math.round(ticket.seconds + (tickets.includes(ticket.ticketId) ? extra / tickets.length : 0)),
    entrySeconds: (entry) => entry.seconds + (entry.id === running?.id ? extra : 0),
  };
}

/**
 * The timer check and the sheet disagree: the timer was stopped, swapped, or started in this period since
 * the sheet was read (or the sheet came from the server's short-lived copy). Unknown (no check yet) is not a disagreement.
 */
export function sheetDisagreesWithTimer(sheet: Timesheet, timer: Timer | null | undefined): boolean {
  if (timer === undefined) return false;

  const running = sheet.running ?? null;
  if (running) return timer === null || timer.entry.id !== running.id;

  // A cut-off sheet may simply not have reached it: no reload on every check for that.
  if (!timer || !timer.inThisOrganization || sheet.truncated) return false;
  const day = localDay(new Date(timer.entry.start), sheet.timeZone);
  return day >= sheet.from && day <= sheet.to;
}
