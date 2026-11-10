/**
 * Dictionnaire français. Pour ajouter une langue : créer i18n/<code>.ts avec
 * la même structure (type Messages) et l'enregistrer dans i18n/index.ts.
 */
export const fr = {
  app: { name: "CellConnect AI", tagline: "Vos captures deviennent des événements organisés." },
  nav: {
    dashboard: "Tableau de bord",
    capture: "Nouvelle capture",
    calendar: "Calendrier",
    groups: "Mes groupes",
    invitations: "Invitations",
    notifications: "Notifications",
    conflicts: "Conflits d'agenda",
    history: "Historique",
    settings: "Paramètres",
    admin: "Administration",
    more: "Plus",
    home: "Accueil",
  },
  participant: { invited: "Invité", accepted: "Participe", tentative: "Peut-être", declined: "Refusé", withdrawn: "Désisté" },
  eventStatus: { confirmed: "Confirmé", tentative: "Provisoire", cancelled: "Annulé" },
  roles: {
    super_admin: "Super administrateur",
    org_admin: "Administrateur",
    group_leader: "Responsable de groupe",
    member: "Membre",
    guest: "Invité",
    leader: "Responsable",
  },
  delivery: { sent: "Envoyé", pending: "En attente", failed: "Échec", skipped: "Non envoyé" },
  channel: { in_app: "Application", email: "E-mail", push: "Push" },
  steps: { received: "Fichier reçu", analyzing: "Analyse en cours", extracted: "Informations extraites", review: "Vérification nécessaire", ready: "Prêt pour validation" },
} as const;

export type Messages = typeof fr;
