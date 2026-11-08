import { getCurrentChatUser } from "@/lib/messenger-auth";
import ChannelScreen from "@/components/products/huddle-ai/ChannelScreen";

export const dynamic = "force-dynamic";

export default async function ProjectChannelPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentChatUser();
  if (!user) return null;
  return <ChannelScreen slug={slug} user={user} expectKind="project" browseHref="/huddle-ai/projects" />;
}
