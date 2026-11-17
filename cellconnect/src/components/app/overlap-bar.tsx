import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { fmtMinutes, fmtTime } from "./format";

type Slot = { start: string; end: string; label: string };

/**
 * Frise de deux événements sur la même échelle de temps, calculée ici à partir des dates reçues.
 * - Chevauchement : zone commune hachurée « 1 h en commun · de 21h00 à 22h00 ».
 * - Pas de chevauchement (temps de trajet trop court) : l'écart est hachuré,
 *   « Seulement 15 min entre les deux ».
 * Une version texte complète est fournie aux lecteurs d'écran.
 *
 * Exemple : <OverlapBar a={{ start, end, label: "Formation Cellules" }} b={{ start: s2, end: e2, label: "Culte" }} tz="Europe/Zurich" />
 */
const HATCH: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(135deg, color-mix(in srgb, var(--warning) 45%, transparent) 0 3px, transparent 3px 7px)",
};

export function OverlapBar({ a, b, tz = "Europe/Zurich", className }: { a: Slot; b: Slot; tz?: string; className?: string }) {
  const ms = (s: string) => new Date(s).getTime();
  const [aS, aE, bS, bE] = [ms(a.start), ms(a.end), ms(b.start), ms(b.end)];
  if (![aS, aE, bS, bE].every(Number.isFinite) || aE <= aS || bE <= bS) return null;

  const from = Math.min(aS, bS);
  const to = Math.max(aE, bE);
  const span = to - from;
  const pct = (t: number) => `${((t - from) / span) * 100}%`;
  const width = (s: number, e: number) => `${((e - s) / span) * 100}%`;

  const zoneStart = Math.max(aS, bS);
  const zoneEnd = Math.min(aE, bE);
  const overlaps = zoneEnd > zoneStart;
  // Sans chevauchement, la zone mise en évidence est l'écart entre la fin du premier et le début du second.
  const [gapS, gapE] = aE <= bS ? [aE, bS] : [bE, aS];
  const [hS, hE] = overlaps ? [zoneStart, zoneEnd] : [gapS, gapE];
  const minutes = Math.round((hE - hS) / 60000);
  const range = `de ${fmtTime(new Date(hS).toISOString(), tz)} à ${fmtTime(new Date(hE).toISOString(), tz)}`;
  const headline = overlaps ? `${fmtMinutes(minutes)} en commun` : minutes > 0 ? `Seulement ${fmtMinutes(minutes)} entre les deux` : "Aucune pause entre les deux";
  const time = (s: string) => fmtTime(s, tz);
  const iso = (t: number) => new Date(t).toISOString();

  const rows: { id: string; slot: Slot; s: number; e: number; bar: string }[] = [
    { id: "a", slot: a, s: aS, e: aE, bar: "bg-primary" },
    { id: "b", slot: b, s: bS, e: bE, bar: "bg-muted" },
  ];

  return (
    <div className={cn("text-xs", className)}>
      <p className="sr-only">
        {a.label} : {time(a.start)} à {time(a.end)}. {b.label} : {time(b.start)} à {time(b.end)}. {headline}
        {minutes > 0 ? `, ${range}` : ""}.
      </p>
      <div aria-hidden>
        <p className="mb-1.5 font-semibold text-warning">
          {headline}
          {minutes > 0 && <span className="font-normal text-muted"> · {range}</span>}
        </p>
        <ul className="mb-2 space-y-0.5">
          {rows.map(({ id, slot, bar }) => (
            <li key={id} className="flex min-w-0 items-center gap-2 text-muted">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", bar)} />
              <span className="truncate">
                <span className="font-medium text-fg">{slot.label}</span> · <span className="tabular-nums">{time(slot.start)}–{time(slot.end)}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="relative space-y-1.5">
          {rows.map(({ id, s, e, bar }) => (
            <div key={id} className="relative h-3 rounded-full bg-subtle">
              <div className={cn("absolute inset-y-0 rounded-full", bar)} style={{ left: pct(s), width: width(s, e) }} />
            </div>
          ))}
          {minutes > 0 && <div className="absolute -inset-y-1 z-10 border-x-2 border-warning" style={{ left: pct(hS), width: width(hS, hE), ...HATCH }} />}
        </div>
        <div className="mt-1 flex justify-between text-muted tabular-nums">
          <span>{time(iso(from))}</span>
          <span>{time(iso(to))}</span>
        </div>
      </div>
    </div>
  );
}
