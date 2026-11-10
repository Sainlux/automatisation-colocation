"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";
import { Disclosure } from "@/components/ui/disclosure";
import { fmtFullDate, RECURRENCES } from "./format";

export interface EventFormValues {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  timezone: string;
  location: string;
  meetingUrl: string;
  description: string;
  groupId: string;
  recurrenceRule: string;
  inviteGroup?: boolean;
}

/** Durées proposées en un toucher (minutes). */
const DURATIONS = [
  { min: 60, label: "1 h" },
  { min: 90, label: "1 h 30" },
  { min: 120, label: "2 h" },
];

const toMin = (hhmm: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const fromMin = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
/** Durée en minutes ; une fin avant le début signifie le lendemain. */
const durationOf = (start: string, end: string) => {
  const s = toMin(start);
  const e = toMin(end);
  if (s === null || e === null) return null;
  return e > s ? e - s : e + 1440 - s;
};

export function EventForm({
  initial,
  submitLabel,
  onSubmit,
  allowInviteGroup,
  error,
}: {
  initial: EventFormValues;
  submitLabel: string;
  onSubmit: (v: EventFormValues) => Promise<void>;
  allowInviteGroup?: boolean;
  error?: string | null;
}) {
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  // Les options sont repliées, sauf si l'une d'elles est déjà remplie.
  const [optionsOpen, setOptionsOpen] = useState(Boolean(initial.location || initial.meetingUrl || initial.groupId || initial.recurrenceRule || initial.description));
  const groups = useApi<{ groups: { id: string; name: string; canManage: boolean }[] }>("/api/groups");
  const set = (p: Partial<EventFormValues>) => setV({ ...v, ...p });
  const group = groups.data?.groups.find((g) => g.id === v.groupId);
  const recurrenceKnown = RECURRENCES.some((r) => r.value === v.recurrenceRule);
  const duration = durationOf(v.startTime, v.endTime);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(v.date);

  return (
    <form
      className="space-y-4"
      // Un champ invalide caché dans les options : on les déplie pour que le navigateur puisse le montrer.
      onInvalidCapture={() => setOptionsOpen(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(v);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Titre" htmlFor="title">
        <Input id="title" required maxLength={200} value={v.title} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="Date" htmlFor="date" hint={dateValid ? fmtFullDate(v.date) : undefined}>
        <Input id="date" type="date" required value={v.date} onChange={(e) => set({ date: e.target.value })} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Début" htmlFor="start">
          <Input
            id="start"
            type="time"
            required
            value={v.startTime}
            onChange={(e) => {
              // La durée choisie est conservée quand on déplace le début.
              const s = toMin(e.target.value);
              set(s !== null && duration !== null ? { startTime: e.target.value, endTime: fromMin(s + duration) } : { startTime: e.target.value });
            }}
          />
        </Field>
        <Field label="Fin" htmlFor="end" hint={v.endTime && v.startTime && v.endTime <= v.startTime ? "Se termine le lendemain." : undefined}>
          <Input id="end" type="time" required value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
      </div>
      <div role="group" aria-labelledby="duration-label" className="flex flex-wrap items-center gap-2">
        <span id="duration-label" className="text-sm text-muted">
          Durée
        </span>
        {DURATIONS.map((d) => (
          <Button
            key={d.min}
            type="button"
            size="sm"
            variant="outline"
            pressed={duration === d.min}
            onClick={() => {
              const s = toMin(v.startTime);
              if (s !== null) set({ endTime: fromMin(s + d.min) });
            }}
          >
            {d.label}
          </Button>
        ))}
      </div>

      <Disclosure summary="Lieu, lien et options" open={optionsOpen} onToggle={setOptionsOpen}>
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <Field label="Lieu" htmlFor="location">
            <Input id="location" value={v.location} onChange={(e) => set({ location: e.target.value })} />
          </Field>
          <Field label="Lien de la visio (Zoom, Meet…)" htmlFor="url">
            <Input id="url" type="url" inputMode="url" pattern="https://.*" value={v.meetingUrl} onChange={(e) => set({ meetingUrl: e.target.value })} placeholder="https://" />
          </Field>
          <Field label="Groupe" htmlFor="group">
            <Select id="group" value={v.groupId} onChange={(e) => set({ groupId: e.target.value, inviteGroup: false })}>
              <option value="">Personnel</option>
              {groups.data?.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Répétition" htmlFor="rec">
            <Select id="rec" value={v.recurrenceRule} onChange={(e) => set({ recurrenceRule: e.target.value })}>
              {!recurrenceKnown && <option value={v.recurrenceRule}>Répétition personnalisée</option>}
              {RECURRENCES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          {allowInviteGroup && group?.canManage && (
            <Checkbox className="sm:col-span-2" checked={Boolean(v.inviteGroup)} onChange={(e) => set({ inviteGroup: e.target.checked })} label={`Inviter tous les membres de « ${group.name} »`} />
          )}
          <Field label="Description" htmlFor="desc" className="sm:col-span-2">
            <Textarea id="desc" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </div>
      </Disclosure>

      {error && (
        <Alert tone="danger" live>
          {error}
        </Alert>
      )}
      <Button type="submit" size="lg" loading={busy} className="w-full sm:w-auto">
        {submitLabel}
      </Button>
    </form>
  );
}

export function toPayload(v: EventFormValues) {
  return {
    title: v.title,
    date: v.date,
    startTime: v.startTime,
    endTime: v.endTime,
    timezone: v.timezone,
    location: v.location || null,
    meetingUrl: v.meetingUrl || null,
    description: v.description || null,
    groupId: v.groupId || null,
    recurrenceRule: v.recurrenceRule || null,
    ...(v.inviteGroup !== undefined ? { inviteGroup: v.inviteGroup } : {}),
  };
}
