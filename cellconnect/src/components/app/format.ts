import { DateTime } from "luxon";

export const fmtDay = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("cccc d LLLL");
export const fmtDayShort = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("ccc d LLL");
export const fmtTime = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).toFormat("HH'h'mm");
export const fmtDateTime = (iso: string, tz = "Europe/Zurich") => DateTime.fromISO(iso, { zone: "utc" }).setZone(tz).setLocale("fr-CH").toFormat("d LLL yyyy, HH'h'mm");
export const fmtRange = (s: string, e: string, tz = "Europe/Zurich") => `${fmtDay(s, tz)} · ${fmtTime(s, tz)} – ${fmtTime(e, tz)}`;
export const fmtFullDate = (isoDate: string) => DateTime.fromISO(isoDate).setLocale("fr-CH").toFormat("cccc d LLLL yyyy");
export const relative = (iso: string) => DateTime.fromISO(iso).setLocale("fr").toRelative() ?? "";
