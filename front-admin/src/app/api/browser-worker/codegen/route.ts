import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Codegen CLI removido. Teach usa sessão headed do worker. */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Use Abrir Chromium no Flow Builder (sessão headed)." },
    { status: 410 },
  );
}
