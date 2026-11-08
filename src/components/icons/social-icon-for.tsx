import { Link2 } from "lucide-react";
import { FacebookIcon, GithubIcon, XIcon, InstagramIcon, YoutubeIcon, LinkedinIcon, WhatsAppIcon } from "@/components/icons/SocialIcons";

type IconComponent = (props: { className?: string }) => React.ReactNode;

const SOCIAL_ICONS: Record<string, IconComponent> = {
  Facebook: FacebookIcon,
  GitHub: GithubIcon,
  "X (Twitter)": XIcon,
  Instagram: InstagramIcon,
  YouTube: YoutubeIcon,
  LinkedIn: LinkedinIcon,
  WhatsApp: WhatsAppIcon,
};

/** Brand icon for a CMS social link name (Site Identity → Social links); a generic link icon for anything else. */
export function socialIconFor(name: string): IconComponent {
  return SOCIAL_ICONS[name] ?? Link2;
}

export const KNOWN_SOCIAL_NAMES = Object.keys(SOCIAL_ICONS);
