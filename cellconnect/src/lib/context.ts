import type { Store } from "@/lib/db/store";
import type { OrgRole } from "@/lib/types";
import type { ChannelSender } from "@/lib/channels/email";

/**
 * Contexte d'exécution d'une action : qui agit, dans quelle organisation.
 * Construit à partir de la session vérifiée côté serveur (jamais depuis des
 * données fournies par le client).
 */
export interface Ctx {
  store: Store;
  userId: string;
  email: string;
  orgId: string;
  orgRole: OrgRole;
  timezone: string;
  now: () => Date;
  /** Canal e-mail (injectable pour les tests). */
  mailer: ChannelSender;
}

/** Contexte système (worker, cron) : pas d'utilisateur, accès restreint aux tâches planifiées. */
export interface SystemCtx {
  store: Store;
  now: () => Date;
  mailer: ChannelSender;
}
