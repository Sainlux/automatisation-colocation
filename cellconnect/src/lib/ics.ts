import { DateTime } from "luxon";
import type { EventRow } from "@/lib/types";
import type { ExtractionResult } from "@/lib/schemas/extraction";

/** Export / import iCalendar (RFC 5545), sans dépendance externe. */

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut), "utf8") > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

const utcStamp = (iso: string) => DateTime.fromISO(iso, { zone: "utc" }).toFormat("yyyyMMdd'T'HHmmss'Z'");

export function eventsToIcs(events: EventRow[], appUrl: string, calName = "CellConnect AI"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CellConnect AI//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) {
    const startLocal = DateTime.fromISO(e.starts_at, { zone: "utc" }).setZone(e.timezone).toFormat("yyyyMMdd'T'HHmmss");
    const endLocal = DateTime.fromISO(e.ends_at, { zone: "utc" }).setZone(e.timezone).toFormat("yyyyMMdd'T'HHmmss");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@cellconnect`,
      `DTSTAMP:${utcStamp(e.updated_at)}`,
      `DTSTART;TZID=${e.timezone}:${startLocal}`,
      `DTEND;TZID=${e.timezone}:${endLocal}`,
      `SUMMARY:${esc(e.title)}`,
      `SEQUENCE:${e.version}`,
      `STATUS:${e.status === "cancelled" ? "CANCELLED" : e.status === "tentative" ? "TENTATIVE" : "CONFIRMED"}`,
    );
    if (e.recurrence_rule) lines.push(`RRULE:${e.recurrence_rule.replace(/^RRULE:/i, "")}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    const desc = [e.description, e.meeting_url ? `Lien : ${e.meeting_url}` : null].filter(Boolean).join("\n");
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (e.meeting_url) lines.push(`URL:${e.meeting_url}`);
    lines.push(`X-CELLCONNECT-URL:${appUrl}/evenements/${e.id}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

function unesc(s: string) {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/**
 * Lecture d'un fichier .ics en événements extraits (passent ensuite par la
 * même étape de validation que les captures).
 */
export function icsToExtraction(text: string, defaultTz: string): ExtractionResult {
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const blocks = unfolded.split(/BEGIN:VEVENT/).slice(1).map((b) => b.split(/END:VEVENT/)[0]);
  const warnings: string[] = [];
  const events = blocks.slice(0, 50).map((b) => {
    const props = new Map<string, { params: string; value: string }>();
    for (const line of b.split(/\r?\n/)) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line.trim());
      if (m && !props.has(m[1])) props.set(m[1], { params: m[2], value: m[3] });
    }
    const parseDt = (p?: { params: string; value: string }) => {
      if (!p) return null;
      const tzid = /TZID=([^;:]+)/.exec(p.params)?.[1];
      const v = p.value.trim();
      if (/^\d{8}$/.test(v)) return { dt: DateTime.fromFormat(v, "yyyyMMdd", { zone: tzid ?? defaultTz }), allDay: true, tz: tzid ?? defaultTz };
      const zone = v.endsWith("Z") ? "utc" : (tzid ?? defaultTz);
      const dt = DateTime.fromFormat(v.replace(/Z$/, ""), "yyyyMMdd'T'HHmmss", { zone });
      return { dt: dt.setZone(tzid ?? defaultTz), allDay: false, tz: tzid ?? defaultTz };
    };
    const start = parseDt(props.get("DTSTART"));
    const end = parseDt(props.get("DTEND"));
    const valid = start?.dt.isValid;
    const uncertain: string[] = [];
    if (!valid) uncertain.push("date");
    if (!end?.dt.isValid) uncertain.push("endTime");
    if (start?.allDay) uncertain.push("startTime");
    return {
      title: props.get("SUMMARY") ? unesc(props.get("SUMMARY")!.value).slice(0, 200) : null,
      date: valid
        ? { year: start!.dt.year, month: start!.dt.month, day: start!.dt.day, weekday: null, raw: props.get("DTSTART")!.value }
        : { year: null, month: null, day: null, weekday: null, raw: null },
      startTime: valid && !start!.allDay ? start!.dt.toFormat("HH:mm") : null,
      endTime: end?.dt.isValid && !end.allDay ? end.dt.toFormat("HH:mm") : null,
      timezone: start?.tz ?? null,
      location: props.get("LOCATION") ? unesc(props.get("LOCATION")!.value).slice(0, 300) : null,
      meetingUrl: props.get("URL")?.value.startsWith("https://") ? props.get("URL")!.value : null,
      meetingPlatform: null,
      organizer: null,
      groupName: null,
      description: props.get("DESCRIPTION") ? unesc(props.get("DESCRIPTION")!.value).slice(0, 2000) : null,
      notes: null,
      recurrenceText: props.get("RRULE")?.value ?? null,
      confidence: valid ? 0.95 : 0.3,
      uncertainFields: uncertain,
      sourceExcerpt: props.get("SUMMARY")?.value.slice(0, 200) ?? null,
    };
  });
  if (blocks.length > 50) warnings.push("Seuls les 50 premiers événements du fichier ont été importés.");
  if (events.length === 0) warnings.push("Aucun événement (VEVENT) trouvé dans ce fichier.");
  return { events, contextNotes: null, warnings };
}
