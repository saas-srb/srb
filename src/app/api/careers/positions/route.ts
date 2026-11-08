import { withTransport } from "@/lib/security/transport";
import { NextResponse } from "next/server";
import { getOpenJobPositions } from "@/lib/career-applications";

async function handleGET() {
  const positions = await getOpenJobPositions();
  return NextResponse.json({ data: positions });
}

export const GET = withTransport(handleGET);
