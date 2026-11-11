import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { addOrgMemberByEmail, listOrgMembers } from "@/lib/agents/group-agent";

export const GET = api(async ({ ctx }) => ({ members: await listOrgMembers(ctx) }));

const schema = z.object({ email: z.string().trim().email(), role: z.enum(["org_admin", "group_leader", "member", "guest"]).default("member") });
export const POST = api(async ({ req, ctx }) => {
  const { email, role } = await body(req, schema);
  return { member: await addOrgMemberByEmail(ctx, email, role) };
});
