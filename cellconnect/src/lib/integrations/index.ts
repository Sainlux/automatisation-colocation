import type { Store } from "@/lib/db/store";
import type { CalendarConnection, EventRow } from "@/lib/types";
import type { OccurrenceException } from "@/lib/agents/conflict-engine";
import { providerConfig } from "./oauth";
import * as google from "./google-calendar";
import * as outlook from "./outlook-calendar";
import * as zoom from "./zoom";

/** Registre des intégrations par fournisseur (utilisé par le worker et les routes). */

type Ev = EventRow & { exceptions?: Record<string, OccurrenceException> };

export function isConfigured(c: CalendarConnection) {
  return providerConfig(c.provider).configured;
}

export async function pushEvent(store: Store, c: CalendarConnection, e: Ev, op: "upsert" | "delete") {
  if (c.provider === "google") return google.pushEvent(store, c, e, op);
  if (c.provider === "outlook") return outlook.pushEvent(store, c, e, op);
  return zoom.pushEvent(store, c, e, op);
}

export async function watch(store: Store, c: CalendarConnection) {
  if (c.provider === "google") return google.watch(store, c);
  if (c.provider === "outlook") return outlook.watch(store, c);
  return null;
}

export async function stopWatch(store: Store, c: CalendarConnection) {
  if (c.provider === "google") return google.stopWatch(store, c);
  if (c.provider === "outlook") return outlook.stopWatch(store, c);
}
