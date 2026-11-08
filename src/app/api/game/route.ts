import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { limitOr429 } from "@/lib/security/rate-limit";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { getGameState, isPlayerId, submitScore } from "@/lib/game/scores";

export const dynamic = "force-dynamic";

async function companyOrNull(): Promise<string | null> {
  try {
    return await currentCompanyIdOrNull();
  } catch {
    return null;
  }
}

/** The leaderboard of this address (its company, or everyone where no company owns it) and, with `?player=`, that player's best. */
async function handleGET(req: Request) {
  const limited = await limitOr429(req, "game-read", 120, 3600);
  if (limited) return limited;
  const player = new URL(req.url).searchParams.get("player");
  try {
    return NextResponse.json(await getGameState(await companyOrNull(), isPlayerId(player) ? player.toLowerCase() : null), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ best: 0, plays: 0, top: [] });
  }
}

/** Saves a finished run: { playerId, name, score, durationMs, page }. */
async function handlePOST(req: Request) {
  const limited = await limitOr429(req, "game-score", 60, 3600);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  try {
    const res = await submitScore({ companyId: await companyOrNull(), playerId: body.playerId, name: body.name, score: body.score, durationMs: body.durationMs, page: body.page });
    return NextResponse.json(res, { status: res.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't save the score." }, { status: 500 });
  }
}

export const GET = withTransport(handleGET);
export const POST = withTransport(handlePOST);
