import { useId, type ReactNode, type Ref } from "react";
import { Bell } from "lucide-react";
import { DateTile } from "@/components/app/date-tile";
import { fmtOffsets, fmtShortDate, fmtTimeRange, frTypo, plural } from "@/components/app/format";
import { cn } from "@/lib/utils";
import { isValidDate, timeLabel, type Draft } from "./draft-utils";

export interface RecapData {
  added: Draft[];
  notAdded: { draft: Draft; conflictWith: string | null }[];
  withdrawn: { id: string; title: string; start: string; end: string; notify: boolean }[];
  kept: { id: string; draft: Draft; otherTitle: string }[];
}

/** Récapitulatif avant enregistrement, en listes groupées (une section par conséquence). */
export function RecapSummary({
  headingRef,
  data,
  commonTitle,
  reminderOffsets,
  tz,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  data: RecapData;
  commonTitle: string | null;
  reminderOffsets: readonly number[];
  tz: string;
}) {
  const n = data.added.length;
  const titleOf = (d: Draft) => (d.title.trim() && d.title.trim() !== commonTitle ? frTypo(d.title) : null);
  const reminders = reminderOffsets.length ? `Rappels : ${fmtOffsets(reminderOffsets)}` : "Aucun rappel prévu (modifiable dans Paramètres)";

  return (
    <div className="space-y-5">
      <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold focus:outline-none">
        {n === 0 ? "Aucune date à ajouter" : plural(n, "date à ajouter", "dates à ajouter")}
      </h2>

      {n > 0 && (
        <Section title="Ajoutées à votre agenda" count={n} intro={commonTitle ? <p className="font-medium">{frTypo(commonTitle)}</p> : null}>
          {data.added.map((d) => (
            <DateRow key={d.key} date={d.date} tone="warm" primary={dateText(d.date)} secondary={timeLabel(d)} extra={titleOf(d)} />
          ))}
        </Section>
      )}

      {data.notAdded.length > 0 && (
        <Section title="Non ajoutées" count={data.notAdded.length}>
          {data.notAdded.map(({ draft: d, conflictWith }) => (
            <DateRow
              key={d.key}
              date={d.date}
              muted
              primary={dateText(d.date)}
              secondary={timeLabel(d)}
              extra={[titleOf(d), conflictWith ? `en conflit avec « ${frTypo(conflictWith)} »` : null].filter(Boolean).join(" · ") || null}
            />
          ))}
        </Section>
      )}

      {data.withdrawn.length > 0 && (
        <Section title="Vous vous retirez de" count={data.withdrawn.length} footer="Réversible depuis la fiche de l'événement.">
          {data.withdrawn.map((w) => (
            <DateRow
              key={w.id}
              date={w.start}
              tz={tz}
              primary={frTypo(w.title)}
              secondary={`${fmtShortDate(w.start, tz)} · ${fmtTimeRange(w.start, w.end, tz)}`}
              extra={w.notify ? "L'organisateur sera prévenu." : null}
            />
          ))}
        </Section>
      )}

      {data.kept.length > 0 && (
        <Section title="Chevauchements à régler plus tard" count={data.kept.length} tone="warning">
          {data.kept.map(({ id, draft: d, otherTitle }) => (
            <DateRow
              key={id}
              date={d.date}
              tone="warning"
              primary={dateText(d.date)}
              secondary={timeLabel(d)}
              extra={`« ${frTypo(d.title)} » et « ${frTypo(otherTitle)} »`}
            />
          ))}
        </Section>
      )}

      <p className="flex items-start gap-2 text-sm">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
        <span>{reminders}</span>
      </p>
      <p className="rounded-xl bg-subtle px-3 py-2 text-sm text-muted">Vous pourrez modifier ou supprimer chaque date depuis l&apos;Agenda.</p>
    </div>
  );
}

const dateText = (date: string | null) => (isValidDate(date) ? fmtShortDate(date) : "Date à compléter");

function Section({
  title,
  count,
  intro,
  footer,
  tone,
  children,
}: {
  title: string;
  count: number;
  intro?: ReactNode;
  footer?: string;
  tone?: "warning";
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className={cn("mb-1.5 px-1 text-xs font-semibold tracking-wide uppercase", tone === "warning" ? "text-warning" : "text-muted")}>
        {title} <span className="font-normal tabular-nums">· {count}</span>
      </h3>
      <div className={cn("overflow-hidden rounded-2xl border bg-card", tone === "warning" ? "border-warning/30" : "border-border")}>
        {intro && <div className="border-b border-border px-3 py-2 text-sm">{intro}</div>}
        <ul className="divide-y divide-border">{children}</ul>
      </div>
      {footer && <p className="mt-1.5 px-1 text-xs text-muted">{footer}</p>}
    </section>
  );
}

function DateRow({
  date,
  tz,
  tone = "default",
  muted,
  primary,
  secondary,
  extra,
}: {
  date: string | null;
  tz?: string;
  tone?: "default" | "warm" | "warning";
  muted?: boolean;
  primary: string;
  secondary: string;
  extra?: string | null;
}) {
  return (
    <li className={cn("flex min-h-14 items-center gap-3 px-3 py-2", muted && "text-muted")}>
      {date && (date.includes("T") || isValidDate(date)) ? <DateTile date={date} tz={tz} size="sm" tone={tone} /> : null}
      <div className="min-w-0 flex-1">
        <p className={cn("font-medium text-balance first-letter:uppercase", muted && "line-through decoration-1")}>{primary}</p>
        <p className="text-sm text-muted tabular-nums">{secondary}</p>
        {extra && <p className="text-sm text-muted">{extra}</p>}
      </div>
    </li>
  );
}
