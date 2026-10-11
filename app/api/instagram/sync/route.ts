import { type NextRequest, NextResponse } from "next/server";
import { syncAllConnections } from "@/services/instagram.server";

/**
 * Daily Instagram sync (`vercel.json` cron): refreshes long-lived tokens that
 * are close to expiring and re-caches each account's latest post permalinks.
 *
 * Same guard as `/api/billing/recurring`: `Authorization: Bearer <CRON_SECRET>`,
 * always, and 503 when the secret is not configured. Never accept the
 * `x-vercel-cron` header as proof — it is forgeable.
 *
 * Vercel Cron issues GET requests; POST is accepted too for manual runs.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado." }, { status: 503 });
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    return NextResponse.json(await syncAllConnections());
  } catch {
    return NextResponse.json({ error: "No se pudo leer las conexiones de Instagram." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
