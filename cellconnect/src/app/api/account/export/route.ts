import { api } from "@/lib/http/api";
import { exportAccountData } from "@/lib/auth/account";

/** Export des données personnelles (portabilité, nLPD / RGPD). */
export const GET = api(async ({ ctx }) => {
  const data = await exportAccountData(ctx.store, ctx.userId);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": 'attachment; filename="cellconnect-mes-donnees.json"',
      "cache-control": "private, no-store",
    },
  });
}, { rateLimit: 5 });
