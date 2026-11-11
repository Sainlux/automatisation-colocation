import { z } from "zod";
import { api, body } from "@/lib/http/api";
import { addGroupMember } from "@/lib/agents/group-agent";

const schema = z.object({ userId: z.string().uuid(), role: z.enum(["leader", "member", "guest"]).default("member") });
export const POST = api(async ({ req, ctx, params }) => {
  const { userId, role } = await body(req, schema);
  return { member: await addGroupMember(ctx, params.id, userId, role) };
});
