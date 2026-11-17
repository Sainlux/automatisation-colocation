import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { conflictId, defaultWithdrawMessage, uniqueConflicts, type DraftConflict } from "@/components/app/review/draft-utils";

function visit(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return proxy(new NextRequest(`http://localhost:3000${path}`, { headers }));
}

describe("proxy : retour après connexion avec les paramètres", () => {
  it("garde le chemin ET la requête dans ?suite=", () => {
    const res = visit("/calendrier?vue=x");
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname + loc.search).toBe("/connexion?suite=%2Fcalendrier%3Fvue%3Dx");
  });

  it("transmet le chemin demandé au rendu serveur (x-cc-path), sans reprendre celui du navigateur", () => {
    const req = new NextRequest("http://localhost:3000/groupes/abc?onglet=1", { headers: { cookie: "cc_session=v", "x-cc-path": "//evil.ch" } });
    const res = proxy(req);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-request-x-cc-path")).toBe("/groupes/abc?onglet=1");
  });
});

describe("conflictId : clé stable", () => {
  const existing = { id: "e1", title: "Réunion", start: "2027-01-20T20:00:00.000Z", end: "2027-01-20T21:30:00.000Z", isOrganizer: false, groupId: null };
  it("ne dépend pas de la position dans la liste", () => {
    const c: DraftConflict = { draftKey: "d1", kind: "partial", overlapMinutes: 60, existing };
    expect(conflictId(c, 0)).toBe(conflictId(c, 3));
    expect(conflictId(c, 0)).toBe("d1:e1:2027-01-20T20:00:00.000Z");
    expect(conflictId({ draftKey: "d1", kind: "full", overlapMinutes: 90, otherDraftKey: "d2" }, 5)).toBe("d1:d2");
  });
  it("utilise l'indice seulement en dernier recours", () => {
    expect(conflictId({ draftKey: "d1", kind: "full", overlapMinutes: 0 }, 2)).toBe("d1:2");
  });
  it("une seule question par paire de dates récurrentes (clés uniques)", () => {
    const pair: DraftConflict = { draftKey: "d1", kind: "partial", overlapMinutes: 30, otherDraftKey: "d2" };
    const other: DraftConflict = { draftKey: "d1", kind: "full", overlapMinutes: 90, existing };
    const list = uniqueConflicts([pair, { ...pair }, other, { ...pair }]);
    expect(list).toHaveLength(2);
    expect(new Set(list.map((c, i) => conflictId(c, i))).size).toBe(2);
  });
});

describe("defaultWithdrawMessage", () => {
  it("donne la date avec l'année, comme le message du serveur", () => {
    const m = defaultWithdrawMessage("Formation", "2027-01-20T19:30:00.000Z", "Europe/Zurich");
    expect(m).toContain("« Formation » du mercredi 20 janvier 2027 à 20h30");
  });
});
