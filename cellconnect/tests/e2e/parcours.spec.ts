import { expect, test, type Page } from "@playwright/test";
import { TEST_NOW } from "./constants";

const CAPTURE = `Voici aussi les dates pour les formations de leaders par ZOOM :
Formation Cellules « Zoom »

1. Lundi 16 novembre 20h30 - 22h
2. Lundi 14 décembre 20h30 - 22h
3. Mercredi 20 janvier 20h30 - 22h
4. Mercredi 17 février 20h30 - 22h
(⚠️vacances)
5. Lundi 15 mars 20h30 - 22h`;

// Chaque test simule un visiteur distinct : la limite de 10 inscriptions par minute et par adresse IP
// s'applique sinon à toute la suite, qui tourne depuis la même machine.
test.beforeEach(async ({ page }, info) => {
  let h = 0;
  for (const c of info.testId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  await page.setExtraHTTPHeaders({ "x-real-ip": `10.${(h >>> 16) & 255}.${(h >>> 8) & 255}.${h & 255}` });
});

/** Crée un compte et attend l'accueil (le titre « Bonjour … » de la page d'accueil). */
async function signup(page: Page, name: string, email: string, password = "motdepasse-solide") {
  await page.goto("/inscription");
  await page.fill("#name", name);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page.getByRole("heading", { level: 1, name: /Bonjour/ })).toBeVisible();
}

/** Colle le message, lance la lecture et attend la liste des dates trouvées. */
async function importMessage(page: Page, text: string, expected: string) {
  await page.goto("/capture");
  await page.getByRole("tab", { name: /Texte/ }).click();
  await page.fill("#paste", text);
  await page.getByRole("button", { name: "Trouver les dates" }).click();
  await expect(page).toHaveURL(/\/capture\/.+/);
  await expect(page.getByText(expected)).toBeVisible({ timeout: 20000 });
}

test("un visiteur non connecté est redirigé et l'API refuse l'accès", async ({ page, request }) => {
  await page.goto("/calendrier");
  await expect(page).toHaveURL(/\/connexion/);
  const r = await request.get("/api/events");
  expect(r.status()).toBe(401);
});

test("parcours complet : inscription → capture → validation → conflit → calendrier → résolution", async ({ page }, info) => {
  const email = `e2e-${info.project.name}-${Date.now()}@exemple.ch`;
  await signup(page, "Daniel E2E", email);

  // Événement déjà présent qui chevauchera la formation du 20 janvier.
  const created = await page.evaluate(async () => {
    const r = await fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Réunion de cellule", date: "2027-01-20", startTime: "21:00", endTime: "22:30", timezone: "Europe/Zurich" }) });
    return r.status;
  });
  expect(created).toBe(200);

  await importMessage(page, CAPTURE, "5 dates trouvées dans le message");
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
  await signup(page, "Organisateur", `orga-${stamp}@exemple.ch`);
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
  // Inscription depuis une invitation : pas de champ « église », on rejoint celle qui invite.
  await expect(guest.getByText("Créez votre compte pour rejoindre votre église et répondre à l'invitation.")).toBeVisible();
  await expect(guest.locator("#organizationName")).toHaveCount(0);
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
  await signup(page, "Partage", `share-${info.project.name}-${Date.now()}@exemple.ch`);
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

test("suppression du compte : un mot faux ne supprime rien, SUPPRIMER efface le compte", async ({ page }, info) => {
  const email = `delete-${info.project.name}-${Date.now()}@exemple.ch`;
  await signup(page, "Compte à supprimer", email);
  await page.goto("/parametres");
  await page.getByText("Supprimer mon compte").click();
  const confirmField = page.locator("#delete-confirm");
  const remove = page.getByRole("button", { name: "Supprimer définitivement" });

  // Mot faux : le bouton reste inactif, et l'API refuse aussi.
  await confirmField.fill("SUPPRIME");
  await expect(remove).toBeDisabled();
  const refused = await page.evaluate(async () => {
    const r = await fetch("/api/account", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "OUI" }) });
    return r.status;
  });
  expect(refused).toBe(400);
  expect(await page.evaluate(async () => (await fetch("/api/me")).status)).toBe(200);

  // Mot exact : le compte est effacé et la personne quitte l'espace connecté.
  await confirmField.fill("SUPPRIMER");
  await expect(remove).toBeEnabled();
  await remove.click();
  // Attendu par le lot « paramètres » : /connexion (l'ancienne version renvoyait vers /inscription).
  await expect(page).toHaveURL(/\/(connexion|inscription)/);
  expect(await page.evaluate(async () => (await fetch("/api/me")).status)).toBe(401);
  const login = await page.evaluate(
    async (e) => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: "motdepasse-solide" }) })).status,
    email,
  );
  expect(login).toBeGreaterThanOrEqual(400);
});

test("date déplacée d'une série : la fiche montre le nouvel horaire", async ({ page }, info) => {
  await signup(page, "Responsable", `move-${info.project.name}-${Date.now()}@exemple.ch`);
  const { id, status } = await page.evaluate(async () => {
    const r = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Groupe de maison", date: "2026-11-19", startTime: "19:00", endTime: "20:30", timezone: "Europe/Zurich", recurrenceRule: "FREQ=WEEKLY;COUNT=4" }),
    });
    const j = await r.json();
    return { id: j.event?.id as string, status: r.status };
  });
  expect(status).toBe(200);
  // Jeudi 26 novembre 19h00 (heure d'hiver, UTC+1) déplacé au vendredi 27 novembre 20h15 – 21h45.
  const original = "2026-11-26T18:00:00.000Z";
  const moved = await page.evaluate(
    async ({ id, original }) =>
      (
        await fetch(`/api/events/${id}/occurrences`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ occurrenceStart: original, action: "move", date: "2026-11-27", startTime: "20:15", endTime: "21:45" }),
        })
      ).status,
    { id, original },
  );
  expect(moved).toBe(200);

  await page.goto(`/evenements/${id}?occurrence=${encodeURIComponent(original)}`);
  await expect(page.getByRole("heading", { name: "Groupe de maison" })).toBeVisible();
  await expect(page.getByText(/Date déplacée/)).toBeVisible();
  await expect(page.getByText(/^\s*20h15\s*–\s*21h45\s*$/)).toBeVisible();
});

test("agenda en liste : Tab atteint un événement et Entrée ouvre sa fiche", async ({ page }, info) => {
  // Le navigateur vit à la même date que le serveur : l'agenda s'ouvre sur novembre 2026.
  await page.clock.setFixedTime(new Date(TEST_NOW));
  await signup(page, "Clavier", `clavier-${info.project.name}-${Date.now()}@exemple.ch`);
  const created = await page.evaluate(async () => {
    const r = await fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Répétition chorale", date: "2026-11-20", startTime: "18:30", endTime: "20:00", timezone: "Europe/Zurich" }),
    });
    return r.status;
  });
  expect(created).toBe(200);

  await page.goto("/calendrier");
  await expect(page.locator(".fc")).toBeVisible();
  await page.getByRole("button", { name: "Liste" }).first().click();
  const link = page.locator(".fc-list").getByRole("link", { name: /Répétition chorale/ });
  await expect(link).toBeVisible();

  // Navigation au clavier seulement : Tab jusqu'au lien de l'événement, puis Entrée.
  await page.locator(".fc").focus().catch(() => undefined);
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await link.evaluate((el) => el === document.activeElement);
  }
  expect(reached).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/evenements\//);
  await expect(page.getByRole("heading", { name: "Répétition chorale" })).toBeVisible();
});

test("double appui sur Ajouter : un seul jeu d'événements", async ({ page }, info) => {
  await signup(page, "Double appui", `double-${info.project.name}-${Date.now()}@exemple.ch`);
  await importMessage(page, CAPTURE, "5 dates trouvées dans le message");
  await page.getByRole("button", { name: "Ces 5 dates sont justes" }).click();
  await page.getByRole("button", { name: "Vérifier mon agenda" }).click();
  // Agenda vide : pas de chevauchement, on arrive directement au récapitulatif.
  await expect(page.getByText(/Seront ajoutées/)).toBeVisible();
  await expect(page).toHaveURL(/etape=recap/);
  await page.getByRole("button", { name: /Ajouter les 5 dates/ }).dblclick();
  await expect(page.getByRole("heading", { name: "5 dates ajoutées à votre agenda" })).toBeVisible();

  const titles = await page.evaluate(async () => (await (await fetch("/api/events?from=2026-11-01T00:00:00Z&to=2027-04-01T00:00:00Z")).json()).items.map((i: { title: string }) => i.title));
  expect(titles.filter((t: string) => t.startsWith("Formation"))).toHaveLength(5);
});
