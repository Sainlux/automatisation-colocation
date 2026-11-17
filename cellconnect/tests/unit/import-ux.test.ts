import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/client/safe-next";
import {
  buildDecisions,
  buildRecap,
  conflictId,
  includedByDefault,
  otherTitle,
  pastIssue,
  prefersReducedMotion,
  scrollBehavior,
  type Choice,
  type Draft,
  type DraftConflict,
} from "@/components/app/review/draft-utils";
import * as motion from "@/components/app/motion";

const ORIGIN = "https://cellconnect.example.ch";

describe("safeNext (adresse de retour après connexion)", () => {
  it("refuse les adresses qui mènent vers un autre site", () => {
    expect(safeNext("//evil.ch", ORIGIN)).toBe("/");
    expect(safeNext("/\\evil.ch", ORIGIN)).toBe("/");
    expect(safeNext("\\\\evil.ch", ORIGIN)).toBe("/");
    expect(safeNext("https://evil.ch/x", ORIGIN)).toBe("/");
    expect(safeNext("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(safeNext("/\tevil", ORIGIN)).toBe("/");
    expect(safeNext("/a\nb", ORIGIN)).toBe("/");
  });

  it("garde le chemin, la requête et l'ancre d'une adresse du même site", () => {
    expect(safeNext("/invitation/abc?x=1#y", ORIGIN)).toBe("/invitation/abc?x=1#y");
    expect(safeNext("/capture", ORIGIN)).toBe("/capture");
  });

  it("renvoie / quand il n'y a pas d'adresse", () => {
    expect(safeNext(null, ORIGIN)).toBe("/");
    expect(safeNext("", ORIGIN)).toBe("/");
    // Sans origine connue (côté serveur), rien n'est accepté.
    expect(safeNext("/capture")).toBe("/");
  });
});

const draft = (key: string, over: Partial<Draft> = {}): Draft => ({
  key,
  title: "Formation Cellules",
  date: "2027-01-20",
  startTime: "20:30",
  endTime: "22:00",
  timezone: "Europe/Zurich",
  location: null,
  meetingUrl: null,
  description: null,
  groupId: null,
  recurrenceRule: null,
  confidence: 0.95,
  sourceExcerpt: null,
  issues: [],
  yearSuggestion: null,
  confirmed: false,
  ...over,
});

const existing = (id: string, title: string) => ({ id, title, start: "2027-01-20T20:00:00.000Z", end: "2027-01-20T21:30:00.000Z", isOrganizer: false, groupId: null });

describe("dates déjà passées", () => {
  it("sont décochées par défaut, avec l'avertissement du serveur", () => {
    const past = draft("p", { issues: [{ field: "date", severity: "warning", message: "Cette date est déjà passée : l'ajouter quand même ?" }] });
    expect(pastIssue(past)?.message).toContain("déjà passée");
    expect(includedByDefault(past)).toBe(false);
    expect(includedByDefault(draft("i", { included: false }))).toBe(false);
    expect(includedByDefault(draft("r", { status: "rejected" }))).toBe(false);
    expect(includedByDefault(draft("ok"))).toBe(true);
  });
});

describe("otherTitle", () => {
  it("nomme l'événement existant, sinon l'autre date du message", () => {
    const byKey = new Map([["b", draft("b", { title: "Réunion de cellule" })]]);
    expect(otherTitle({ draftKey: "a", kind: "partial", overlapMinutes: 30, existing: existing("e1", "Culte") }, byKey)).toBe("Culte");
    expect(otherTitle({ draftKey: "a", kind: "partial", overlapMinutes: 30, otherDraftKey: "b" }, byKey)).toBe("Réunion de cellule");
    expect(otherTitle({ draftKey: "a", kind: "partial", overlapMinutes: 30, otherDraftKey: "zz" }, byKey)).toBe("");
  });
});

describe("buildRecap", () => {
  const a = draft("a");
  const b = draft("b", { date: "2027-02-17" });
  const c = draft("c", { date: "2027-03-15" });
  const d = draft("d", { date: "2027-04-12" });
  const excludedDraft = draft("x", { date: "2026-01-01" });
  const drafts = [a, b, c, d, excludedDraft];
  const selected = [a, b, c, d];
  const conflicts: DraftConflict[] = [
    { draftKey: "a", kind: "partial", overlapMinutes: 60, existing: existing("e1", "Réunion de cellule") },
    { draftKey: "b", kind: "full", overlapMinutes: 90, existing: existing("e2", "Culte") },
    { draftKey: "c", kind: "partial", overlapMinutes: 15, otherDraftKey: "d" },
  ];
  const choices: Record<string, Choice> = {
    [conflictId(conflicts[0], 0)]: "withdraw_existing",
    [conflictId(conflicts[1], 1)]: "skip_new",
    // conflit 2 sans choix : « garder les deux » par défaut
  };
  const notify = { [conflictId(conflicts[0], 0)]: true };
  const messages = { [conflictId(conflicts[0], 0)]: "  Désolé  " };

  it("calcule les décisions envoyées à l'API", () => {
    const decisions = buildDecisions(selected, conflicts, choices, notify, messages);
    expect(decisions).toEqual([
      { key: "a", action: "create", withdrawFrom: ["e1"], notifyOrganizers: true, withdrawMessage: "Désolé" },
      { key: "b", action: "skip", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null },
      { key: "c", action: "create", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null },
      { key: "d", action: "create", withdrawFrom: [], notifyOrganizers: false, withdrawMessage: null },
    ]);
  });

  it("range chaque date dans la bonne liste du récapitulatif", () => {
    const decisions = buildDecisions(selected, conflicts, choices, notify, messages);
    const recap = buildRecap({ drafts, selected, excluded: [excludedDraft], conflicts, choices, notify, decisions });
    expect(recap.added.map((x) => x.key)).toEqual(["a", "c", "d"]);
    expect(recap.notAdded).toEqual([
      { draft: b, conflictWith: "Culte" },
      { draft: excludedDraft, conflictWith: null },
    ]);
    expect(recap.withdrawn).toEqual([{ id: conflictId(conflicts[0], 0), title: "Réunion de cellule", start: existing("e1", "").start, end: existing("e1", "").end, notify: true }]);
    expect(recap.kept).toEqual([{ id: conflictId(conflicts[2], 2), draft: c, otherTitle: "Formation Cellules" }]);
  });

  it("ignore les conflits des dates qui ne sont plus sélectionnées (après « Réessayer ces dates »)", () => {
    const only = [c];
    const decisions = buildDecisions(only, conflicts, choices, notify, messages);
    const recap = buildRecap({ drafts, selected: only, excluded: [], conflicts, choices, notify, decisions });
    expect(recap.added.map((x) => x.key)).toEqual(["c"]);
    expect(recap.withdrawn).toEqual([]);
    expect(recap.kept.map((k) => k.draft.key)).toEqual(["c"]);
    expect(recap.notAdded).toEqual([]);
  });
});

describe("préférences de mouvement", () => {
  it("draft-utils réexporte celles de motion.ts (une seule source)", () => {
    expect(prefersReducedMotion).toBe(motion.prefersReducedMotion);
    expect(scrollBehavior).toBe(motion.scrollBehavior);
    // Côté serveur (pas de window) : animations autorisées, défilement doux.
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });
});
