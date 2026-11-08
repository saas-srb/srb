import { getCurrentChatUser } from "@/lib/messenger-auth";
import ChannelScreen from "@/components/products/huddle-ai/ChannelScreen";

export const dynamic = "force-dynamic";

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;
  return <ChannelScreen slug={slug} user={user} expectKind="group" browseHref="/huddle-ai/groups" />;
}
