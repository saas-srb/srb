import type { Metadata } from "next";
import GuestJoinClient from "./GuestJoinClient";

export const dynamic = "force-dynamic";
// Personal links must not be indexed or leak through the Referer header.
export const metadata: Metadata = { title: "Join your meeting", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function GuestJoinPage({ params, searchParams }: { params: Promise<{ roomId: string }>; searchParams: Promise<{ t?: string | string[] }> }) {
  const { roomId } = await params;
  const t = (await searchParams).t;
  return <GuestJoinClient roomId={roomId} token={typeof t === "string" ? t : ""} />;
}
