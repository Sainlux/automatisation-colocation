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
  await expect(page.getByText("5 dates trouvées dans le message")).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/tombe un mercredi en 2027/).first()).toBeVisible();

  // Sans confirmation, le bouton principal mène à la prochaine date à relire (jamais de bouton grisé muet).
  await expect(page.getByRole("button", { name: "Voir la suivante (5)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Vérifier mon agenda" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ces 5 dates sont justes" }).click();
  await page.getByRole("button", { name: "Vérifier mon agenda" }).click();

  await expect(page.getByText("Chevauchement de 60 minutes")).toBeVisible();
  await page.getByText("Garder les deux pour l'instant").click();
  await page.getByRole("button", { name: "Voir le récapitulatif" }).click();
  await page.getByRole("button", { name: /Ajouter les 5 dates/ }).click();
  await expect(page.getByRole("heading", { name: "5 dates ajoutées à votre agenda" })).toBeVisible();

  // Résolution : maintenir la formation, se désister de la réunion.
  await page.goto("/conflits");
  await expect(page.getByText("Attention, deux événements se chevauchent.")).toBeVisible();
  const formation = page.getByRole("button", { name: /Formation Cellules/ });
  await formation.click();
  await expect(page.getByText(/Conséquence/)).toBeVisible();
  await page.getByRole("button", { name: /Valider ma décision/ }).click();
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

test("invitation par e-mail : une personne sans compte s'inscrit via le lien et rejoint l'événement", async ({ page, browser }, info) => {
  const stamp = `${info.project.name}-${Date.now()}`;
  await page.goto("/inscription");
  await page.fill("#name", "Organisateur");
  await page.fill("#email", `orga-${stamp}@exemple.ch`);
  await page.fill("#password", "motdepasse-solide");
  await page.click("button[type=submit]");
  await expect(page.getByText("Analyser une capture")).toBeVisible();
  const link: string = await page.evaluate(async () => {
    const e = await (await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Soirée de prière", date: "2027-02-10", startTime: "20:00", endTime: "21:30", timezone: "Europe/Zurich" }) })).json();
    const r = await (await fetch("/api/invitations/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ emails: [`invite-${Date.now()}@exemple.ch`], eventId: e.event.id }) })).json();
    // Avec SMTP, le lien part par e-mail ; sans SMTP il est renvoyé à l'organisateur pour transmission.
    return r.results[0].link ?? "";
  });
  test.skip(!link, "SMTP configuré : le lien a été envoyé par e-mail (vérifié par npm run test:supabase).");

  const guest = await browser.newPage();
  await guest.goto(new URL(link).pathname);
  await expect(guest.getByText("Soirée de prière")).toBeVisible();
  await guest.getByRole("link", { name: "Créer mon compte pour répondre" }).click();
  await guest.fill("#name", "Invitée");
  await guest.fill("#email", `invitee-${stamp}@exemple.ch`);
  await guest.fill("#password", "motdepasse-solide");
  await guest.click("button[type=submit]");
  await expect(guest).toHaveURL(/\/invitation\//);
  await guest.getByRole("button", { name: "Je participe" }).click();
  await expect(guest).toHaveURL(/\/evenements\//);
  await expect(guest.getByRole("heading", { name: "Soirée de prière" })).toBeVisible();
  await expect(guest.getByText("Vous : Participe")).toBeVisible();
  await guest.close();
});

test("partage d'une capture depuis une autre application (Web Share Target via service worker)", async ({ page }, info) => {
  await page.goto("/inscription");
  await page.fill("#name", "Partage");
  await page.fill("#email", `share-${info.project.name}-${Date.now()}@exemple.ch`);
  await page.fill("#password", "motdepasse-solide");
  await page.click("button[type=submit]");
  await expect(page.getByText("Analyser une capture")).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload(); // la page est désormais contrôlée par le service worker
  expect(await page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);

  // Simule le formulaire POST multipart qu'envoie le système d'exploitation lors d'un partage.
  await page.evaluate(() => {
    const f = document.createElement("form");
    f.method = "POST";
    f.action = "/capture/partage";
    f.enctype = "multipart/form-data";
    const input = document.createElement("input");
    input.type = "file";
    input.name = "files";
    input.id = "share-input";
    f.appendChild(input);
    document.body.appendChild(f);
  });
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.setInputFiles("#share-input", { name: "capture-whatsapp.png", mimeType: "image/png", buffer: png });
  await page.evaluate(() => (document.querySelector("#share-input")!.closest("form") as HTMLFormElement).submit());
  await expect(page).toHaveURL(/\/capture\?partage=1/);
  await expect(page.getByRole("list", { name: "Fichiers sélectionnés" }).getByRole("listitem")).toHaveCount(1);
});
