/**
 * Dictionnaire français. Pour ajouter une langue : créer i18n/<code>.ts avec
 * la même structure (type Messages) et l'enregistrer dans i18n/index.ts.
 *
 * Vocabulaire : des mots du quotidien, un seul nom par endroit (Accueil, Agenda, Importer, Conflits).
 * Pas de « (s) », pas de pourcentage, pas de jargon technique.
 */
export const fr = {
  app: { name: "CellConnect AI", tagline: "Vos messages deviennent des dates dans votre agenda." },
  nav: {
    home: "Accueil",
    /** Alias de home (encore référencé par la navigation latérale). */
    dashboard: "Accueil",
    calendar: "Agenda",
    capture: "Importer un message",
    captureShort: "Importer",
    conflicts: "Conflits",
    more: "Plus",
    groups: "Mes groupes",
    invitations: "Invitations",
    notifications: "Notifications",
    history: "Historique",
    settings: "Paramètres",
    admin: "Administration",
  },
  /** Feuille « Plus » de la navigation mobile. */
  moreSheet: { title: "Plus", church: "Mon église", account: "Compte" },
  /** Étapes du parcours d'import, affichées par le Stepper. */
  flow: { review: "Vérifier", conflicts: "Conflits", save: "Enregistrer" },
  /** Étapes de l'analyse (clés = valeurs de job.step), affichées seulement pendant l'analyse. */
  steps: { received: "Message reçu", analyzing: "Lecture", extracted: "Dates trouvées", review: "À vérifier", ready: "Prêt" },
  /** Titre de l'écran d'import selon la phase. */
  reviewTitles: {
    analyzing: "Lecture du message…",
    review: "Vérifiez les dates",
    conflicts: "Conflits avec votre agenda",
    recap: "Récapitulatif",
    done: "C'est enregistré",
    failed: "Lecture impossible",
  },
  /** Statut d'une date importée. « À relire » : confiance < 0,8 (le pourcentage n'est lu qu'aux lecteurs d'écran). */
  reviewStatus: { toReview: "À relire", ready: "Prêt", incomplete: "À compléter", confirm: "C'est correct", edit: "Modifier" },
  states: {
    loading: "Chargement…",
    retry: "Réessayer",
    notFound: { title: "Introuvable", body: "Cette page n'existe pas ou a été supprimée." },
    forbidden: { title: "Accès refusé", body: "Vous n'avez pas accès à cette page. Demandez à un responsable de vous ajouter." },
    offline: { title: "Pas de connexion", body: "Vérifiez votre connexion internet, puis réessayez." },
    server: { title: "Le serveur ne répond pas", body: "Ce n'est pas de votre faute. Réessayez dans un instant.", detail: "Détail technique" },
    generic: { title: "Une erreur est survenue" },
    stale: "Mise à jour impossible pour le moment. Vous voyez les dernières informations reçues.",
  },
  participant: { invited: "Invité", accepted: "Participe", tentative: "Peut-être", declined: "Refusé", withdrawn: "Retiré" },
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
} as const;

export type Messages = typeof fr;
