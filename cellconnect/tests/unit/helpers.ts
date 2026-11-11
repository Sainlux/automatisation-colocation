import { randomUUID } from "node:crypto";
import { LocalStore } from "@/lib/db/local-store";
import type { Ctx } from "@/lib/context";
import type { ChannelSender, OutgoingMessage } from "@/lib/channels/email";
import { bootstrapAccount } from "@/lib/auth/account";
import type { OrgRole } from "@/lib/types";

export class FakeMailer implements ChannelSender {
  sent: OutgoingMessage[] = [];
  failNext = 0;
  constructor(public available = true) {}
  async send(msg: OutgoingMessage) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("SMTP indisponible (simulé)");
    }
    this.sent.push(msg);
  }
}

export const NOW = new Date("2026-11-10T12:00:00Z");

export function memoryStore() {
  return new LocalStore(null);
}

export async function makeUser(store: LocalStore, name: string, mailer: ChannelSender, now = NOW) {
  const id = randomUUID();
  const email = `${name.toLowerCase()}@exemple.ch`;
  await bootstrapAccount(store, { id, email, name });
  const [m] = await store.select("organization_members", { where: [["user_id", "eq", id]] });
  const ctx: Ctx = { store, userId: id, email, orgId: m.organization_id, orgRole: m.role, timezone: "Europe/Zurich", now: () => now, mailer };
  return ctx;
}

/** Ajoute un utilisateur à l'organisation d'un autre et renvoie son contexte dans cette organisation. */
export async function joinOrg(owner: Ctx, member: Ctx, role: OrgRole = "member"): Promise<Ctx> {
  await owner.store.insert("organization_members", { organization_id: owner.orgId, user_id: member.userId, role });
  return { ...member, orgId: owner.orgId, orgRole: role };
}
