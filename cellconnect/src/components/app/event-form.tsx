"use client";

import { useState } from "react";
import { useApi } from "@/lib/client/api";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/alert";

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

const RECURRENCES = [
  { value: "", label: "Pas de répétition" },
  { value: "FREQ=WEEKLY", label: "Chaque semaine" },
  { value: "FREQ=WEEKLY;INTERVAL=2", label: "Toutes les deux semaines" },
  { value: "FREQ=MONTHLY", label: "Chaque mois" },
];

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
  const groups = useApi<{ groups: { id: string; name: string; canManage: boolean }[] }>("/api/groups");
  const set = (p: Partial<EventFormValues>) => setV({ ...v, ...p });
  const group = groups.data?.groups.find((g) => g.id === v.groupId);
  const recurrenceKnown = RECURRENCES.some((r) => r.value === v.recurrenceRule);

  return (
    <form
      className="space-y-3"
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
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date" htmlFor="date">
          <Input id="date" type="date" required value={v.date} onChange={(e) => set({ date: e.target.value })} />
        </Field>
        <Field label="Début" htmlFor="start">
          <Input id="start" type="time" required value={v.startTime} onChange={(e) => set({ startTime: e.target.value })} />
        </Field>
        <Field label="Fin" htmlFor="end" hint={v.endTime && v.startTime && v.endTime <= v.startTime ? "Se termine le lendemain." : undefined}>
          <Input id="end" type="time" required value={v.endTime} onChange={(e) => set({ endTime: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lieu" htmlFor="location">
          <Input id="location" value={v.location} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label="Lien Zoom / Meet (https)" htmlFor="url">
          <Input id="url" type="url" pattern="https://.*" value={v.meetingUrl} onChange={(e) => set({ meetingUrl: e.target.value })} placeholder="https://" />
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
            {!recurrenceKnown && <option value={v.recurrenceRule}>Règle personnalisée ({v.recurrenceRule})</option>}
            {RECURRENCES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Description" htmlFor="desc">
        <Textarea id="desc" rows={3} value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {allowInviteGroup && group?.canManage && (
        <Checkbox checked={Boolean(v.inviteGroup)} onChange={(e) => set({ inviteGroup: e.target.checked })} label={`Inviter tous les membres de « ${group.name} »`} />
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" size="lg" loading={busy}>
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
