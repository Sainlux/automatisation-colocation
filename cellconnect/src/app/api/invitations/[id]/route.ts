import { api } from "@/lib/http/api";
import { revokeInvitation } from "@/lib/agents/invitation-agent";

/** Annule une invitation en attente. */
export const DELETE = api(async ({ ctx, params }) => ({ invitation: await revokeInvitation(ctx, params.id) }));
