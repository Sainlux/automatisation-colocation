import { NextResponse } from "next/server";
import { integrationStatus } from "@/lib/env";

export async function GET() {
  const s = integrationStatus();
  return NextResponse.json({ ok: true, backend: s.dataBackend, ai: s.ai.available, email: s.email.available, google: s.google.available });
}
