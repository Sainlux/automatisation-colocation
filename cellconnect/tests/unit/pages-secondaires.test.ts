import { describe, expect, it } from "vitest";
import {
  effectiveTimes,
  finalReminders,
  HISTORY_FALLBACK,
  historyHref,
  historyLabel,
  inviteShareText,
  isInternalPath,
  notificationHref,
  parseCustomReminder,
  REMINDER_COUNT_ERROR,
  REMINDER_RANGE_ERROR,
  splitEmails,
  stripTrailingUrl,
} from "@/components/app/event/logic";
import { eventHref } from "@/components/app/event-list";
import { REMINDER_PRESETS } from "@/components/app/format";
import { REMINDER_LIMITS } from "@/lib/schemas/reminder";
import { t } from "@/i18n";

const event = { starts_at: "2026-11-16T19:30:00.000Z", ends_at: "2026-11-16T21:00:00.000Z" };

describe("fiche événement : horaire effectif", () => {
  it("une date déplacée affiche le nouvel horaire renvoyé par le serveur", () => {
    const r = effectiveTimes(
      event,
      { originalStart: "2026-11-23T19:30:00.000Z", start: "2026-11-24T18:00:00.000Z", end: "2026-11-24T20:00:00.000Z", status: "moved" },
      { occurrence: "2026-11-23T19:30:00.000Z" },
    );
    expect(r).toEqual({ startIso: "2026-11-24T18:00:00.000Z", endIso: "2026-11-24T20:00:00.000Z" });
  });

  it("sans réponse du serveur, ?start= (date déplacée) l'emporte sur ?occurrence=", () => {
    const r = effectiveTimes(event, null, { occurrence: "2026-11-23T19:30:00.000Z", start: "2026-11-24T18:00:00.000Z" });
    expect(r).toEqual({ startIso: "2026-11-24T18:00:00.000Z", endIso: "2026-11-24T19:30:00.000Z" });
  });

  it("une date prévue garde la durée de l'événement ; sans paramètre, l'horaire de l'événement", () => {
    expect(effectiveTimes(event, null, { occurrence: "2026-11-30T19:30:00.000Z" })).toEqual({ startIso: "2026-11-30T19:30:00.000Z", endIso: "2026-11-30T21:00:00.000Z" });
    expect(effectiveTimes(event, null, { occurrence: "pas une date" })).toEqual({ startIso: event.starts_at, endIso: event.ends_at });
    expect(effectiveTimes(event, undefined)).toEqual({ startIso: event.starts_at, endIso: event.ends_at });
  });
});

describe("liste d'événements : lien vers la fiche", () => {
  it("ajoute start= seulement pour une date déplacée", () => {
    const base = { eventId: "e1", recurring: true, occurrenceStart: "2026-11-23T19:30:00.000Z" };
    expect(eventHref({ ...base, moved: false, start: "2026-11-23T19:30:00.000Z" })).toBe("/evenements/e1?occurrence=2026-11-23T19%3A30%3A00.000Z");
    const moved = new URL(eventHref({ ...base, moved: true, start: "2026-11-24T18:00:00.000Z" }, "agenda"), "https://x.ch");
    expect(moved.searchParams.get("occurrence")).toBe("2026-11-23T19:30:00.000Z");
    expect(moved.searchParams.get("start")).toBe("2026-11-24T18:00:00.000Z");
    expect(moved.searchParams.get("from")).toBe("agenda");
    expect(eventHref({ eventId: "e2", recurring: false, occurrenceStart: "x" })).toBe("/evenements/e2");
  });
});

describe("rappels : « [nombre] [unité] avant »", () => {
  it("convertit minutes, heures et jours", () => {
    expect(parseCustomReminder("45", "minutes")).toEqual({ minutes: 45 });
    expect(parseCustomReminder("3", "hours")).toEqual({ minutes: 180 });
    expect(parseCustomReminder("2", "days")).toEqual({ minutes: 2880 });
    expect(parseCustomReminder("1,5", "hours")).toEqual({ minutes: 90 });
    expect(parseCustomReminder("  ", "hours")).toEqual({ minutes: null });
  });

  it("refuse une valeur hors limites au lieu de l'ignorer", () => {
    expect(parseCustomReminder("2", "minutes").error).toBe(REMINDER_RANGE_ERROR);
    expect(parseCustomReminder("29", "days").error).toBe(REMINDER_RANGE_ERROR);
    expect(parseCustomReminder("-1", "hours").error).toBe(REMINDER_RANGE_ERROR);
    expect(parseCustomReminder("abc", "hours").error).toBe(REMINDER_RANGE_ERROR);
    expect(parseCustomReminder(String(REMINDER_LIMITS.max), "minutes")).toEqual({ minutes: REMINDER_LIMITS.max });
  });

  it("limite le nombre de rappels et retire les doublons", () => {
    expect(finalReminders([30, 1440, 30], 120)).toEqual({ offsets: [1440, 120, 30] });
    const seven = [10080, 2880, 1440, 120, 60, 30];
    expect(finalReminders(seven, 15).error).toBe(REMINDER_COUNT_ERROR);
    expect(finalReminders([], null)).toEqual({ offsets: [] });
  });

  it("les puces proposées respectent les limites du serveur", () => {
    for (const p of REMINDER_PRESETS) {
      expect(p.value).toBeGreaterThanOrEqual(REMINDER_LIMITS.min);
      expect(p.value).toBeLessThanOrEqual(REMINDER_LIMITS.max);
      expect(p.label).toMatch(/avant$/);
    }
  });
});

describe("notifications : lien et texte", () => {
  it("data.url interne d'abord, puis le conflit, puis l'événement à la bonne date", () => {
    expect(notificationHref({ url: "/capture/j1", eventId: "e1" })).toBe("/capture/j1");
    expect(notificationHref({ url: "https://evil.example/x", conflictId: "c1" })).toBe("/conflits#conflit-c1");
    expect(notificationHref({ url: "//evil.example", eventId: "e1" })).toBe("/evenements/e1");
    expect(notificationHref({ eventId: "e1", occurrenceStart: "2026-11-23T19:30:00.000Z" })).toBe("/evenements/e1?occurrence=2026-11-23T19%3A30%3A00.000Z");
    expect(notificationHref({ invitationId: "i1" })).toBeNull();
    expect(notificationHref(null)).toBeNull();
  });

  it("rejette les adresses externes déguisées", () => {
    expect(isInternalPath("/ok")).toBe(true);
    expect(isInternalPath("//evil.example")).toBe(false);
    expect(isInternalPath("/\\evil.example")).toBe(false);
    expect(isInternalPath("javascript:alert(1)")).toBe(false);
  });

  it("retire la dernière ligne quand c'est une adresse", () => {
    expect(stripTrailingUrl("3 dates à vérifier.\nhttps://cellconnect.example/capture/j1")).toBe("3 dates à vérifier.");
    expect(stripTrailingUrl("Ouvrez :\n/capture/j1\n")).toBe("Ouvrez :");
    expect(stripTrailingUrl("Rendez-vous à 20h.")).toBe("Rendez-vous à 20h.");
    expect(stripTrailingUrl("Voir https://x.ch pour le plan")).toBe("Voir https://x.ch pour le plan");
  });
});

describe("historique : libellés et liens", () => {
  it("chaque action connue a un libellé, jamais le code brut", () => {
    for (const a of [
      "inbound.email",
      "inbound.telegram",
      "inbound.telegram_linked",
      "invitation.created",
      "invitation.email_sent",
      "meeting.created",
      "push.subscribed",
      "retention.purged",
      "occurrence.cancel",
      "occurrence.move",
      "occurrence.restore",
    ]) {
      expect(historyLabel(a)).not.toBe(HISTORY_FALLBACK);
      expect(historyLabel(a)).not.toContain(".");
    }
    expect(historyLabel("inconnu.action")).toBe("Autre action");
    expect(historyLabel("conflict.keep_a")).toContain("un des deux événements gardé");
    expect(historyLabel("conflict.keep_b")).not.toMatch(/\b[AB]\b/);
  });

  it("lien vers l'événement ou le groupe seulement quand il a pu être nommé", () => {
    expect(historyHref({ entity_type: "event", entity_id: "e1", title: "Culte" })).toBe("/evenements/e1");
    expect(historyHref({ entity_type: "group", entity_id: "g1", title: "Cellule" })).toBe("/groupes/g1");
    expect(historyHref({ entity_type: "group", entity_id: "g1", title: "Cellule", action: "group.deleted" })).toBeNull();
    expect(historyHref({ entity_type: "event", entity_id: "e1", title: null })).toBeNull();
    expect(historyHref({ entity_type: "conflict", entity_id: "c1", title: "x" })).toBeNull();
  });
});

describe("invitations : saisie et partage manuel", () => {
  it("découpe plusieurs adresses et retire les doublons", () => {
    expect(splitEmails("A@ex.ch, b@ex.ch;\na@ex.ch  c@ex.ch")).toEqual(["a@ex.ch", "b@ex.ch", "c@ex.ch"]);
    expect(splitEmails("  ")).toEqual([]);
  });

  it("le message WhatsApp contient le lien, sans détail technique", () => {
    const txt = inviteShareText("https://app.example/invitation/abc", "Soirée de prière");
    expect(txt).toContain("https://app.example/invitation/abc");
    expect(txt).toContain("« Soirée de prière »");
    expect(txt).not.toMatch(/SMTP|erreur|error/i);
  });

  it("le vocabulaire commun est centralisé", () => {
    expect(t.words.importedMessage).toBe("message importé");
    expect(t.words.findDates).toBe("Trouver les dates");
    expect(t.words.pushOnPhone).toBe("Notifications sur ce téléphone");
    expect(t.words.manualLinkIntro).toBe("L'e-mail n'a pas pu partir. Envoyez ce lien vous-même :");
  });
});
