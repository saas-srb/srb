import PanelScreen from "@/components/platform/saas/Screens";
import DeviceScene, { type SceneVariant } from "@/components/platform/saas/DeviceScene";
import { screenFor } from "@/lib/platform/saas/screens";

/** A real screen of a product on desktop, tablet and mobile (see DeviceScene), or the drawn illustration when no capture exists. */
export default function PanelShot({ moduleKey, name, labels = [], priority = false, variant = 0, }: { moduleKey: string; name: string; labels?: string[]; priority?: boolean; variant?: SceneVariant; glow?: boolean; device?: "duo" | "laptop"; flip?: boolean }) {
  if (!screenFor(moduleKey)) return <div className="relative"><div className="sr-shot-glow" aria-hidden /><div className="sr-shot"><PanelScreen moduleKey={moduleKey} name={name} labels={labels} /></div></div>;
  return <DeviceScene screenKey={moduleKey} name={name} variant={variant} priority={priority} />;
}
