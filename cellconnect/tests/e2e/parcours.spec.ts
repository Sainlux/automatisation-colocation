import { expect, test } from "@playwright/test";

const CAPTURE = `Voici aussi les dates pour les formations de leaders par ZOOM :
Formation Cellules « Zoom »

1. Lundi 16 novembre 20h30 - 22h
2. Lundi 14 décembre 20h30 - 22h
3. Mercredi 20 janvier 20h30 - 22h
4. Mercredi 17 février 20h30 - 22h
(⚠️vacances)
5. Lundi 15 mars 20h30 - 22h`;

test("un visiteur non connecté est redirigé et l'API refuse l'accès", async ({ page, request }) => {
  await page.goto("/calendrier");
  await expect(page).toHaveURL(/\/connexion/);
  const r = await request.get("/api/events");
  expect(r.status()).toBe(401);
});

test("parcours complet : inscription → capture → validation → conflit → calendrier → résolution", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@exemple.ch`;
  await page.goto("/inscription");
  await page.fill("#name", "Daniel E2E");
  await page.fill("#email", email);
  await page.fill("#password", "motdepasse-solide");
  await page.click("button[type=submit]");
  await expect(page.getByText("Analyser une capture")).toBeVisible();

  // Événement déjà présent qui chevauchera la formation du 20 janvier.
  const created = await page.evaluate(async () => {
    const r = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Réunion de cellule", date: "2027-01-20", startTime: "21:00", endTime: "22:30", timezone: "Europe/Zurich" }) });
    return r.status;
  });
  expect(created).toBe(200);

  await page.goto("/capture");
  await page.getByRole("tab", { name: /Texte/ }).click();
  await page.fill("#paste", CAPTURE);
  await page.getByRole("button", { name: "Analyser" }).click();
  await expect(page).toHaveURL(/\/capture\/.+/);
  await expect(page.getByText("5 événement(s) détecté(s)")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/tombe un mercredi en 2027/).first()).toBeVisible();

  // Sans confirmation, impossible de continuer.
  await expect(page.getByRole("button", { name: "Vérifier mon agenda" })).toBeDisabled();
  await page.getByRole("button", { name: "Tout confirmer" }).click();
  await page.getByRole("button", { name: "Vérifier mon agenda" }).click();

  await expect(page.getByText("Chevauchement de 60 minutes")).toBeVisible();
  await page.getByText("Garder les deux pour l'instant").click();
  await page.getByRole("button", { name: "Voir le récapitulatif" }).click();
  await page.getByRole("button", { name: "Confirmer et enregistrer" }).click();
  await expect(page.getByText("5 événement(s) enregistré(s)")).toBeVisible();
  await expect(page.getByText("1 conflit(s) restent à résoudre.")).toBeVisible();

  // Résolution : maintenir la formation, se désister de la réunion.
  await page.goto("/conflits");
  await expect(page.getByText("Attention, deux événements se chevauchent.")).toBeVisible();
  const formation = page.getByRole("button", { name: /Formation Cellules/ });
  await formation.click();
  await expect(page.getByText(/Conséquence/)).toBeVisible();
  await page.getByRole("button", { name: "Valider ma décision" }).click();
  await expect(page.getByText("Aucun conflit")).toBeVisible();

  // Calendrier en liste : les 5 formations sont présentes.
  const items = await page.evaluate(async () => (await (await fetch("/api/events?from=2026-11-01T00:00:00Z&to=2027-04-01T00:00:00Z")).json()).items);
  expect(items.filter((i: { title: string }) => i.title.startsWith("Formation")).map((i: { start: string }) => i.start)).toEqual([
    "2026-11-16T19:30:00.000Z",
    "2026-12-14T19:30:00.000Z",
    "2027-01-20T19:30:00.000Z",
    "2027-02-17T19:30:00.000Z",
    "2027-03-15T19:30:00.000Z",
  ]);
  await page.goto("/calendrier");
  await expect(page.locator(".fc")).toBeVisible();

  // Export iCalendar
  const ics = await page.evaluate(async () => (await fetch("/api/calendar/export")).text());
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(5);
});
