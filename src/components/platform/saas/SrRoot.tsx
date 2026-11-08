import { SAAS_THEME } from "@/lib/platform/saas/theme";
import { themeCssVars } from "@/lib/products/sitecraft-ai/theme-shared";
import SrShell from "@/components/platform/saas/SrShell";

const block = (v: Record<string, string>) => Object.entries(v).map(([k, val]) => `${k}:${val}`).join(";");

/**
 * The root of every page of the product website. It carries both colour sets of the product's theme — light by default, dark when the
 * visitor chose it (`data-theme="dark"` plus the `dark` class, so Tailwind's `dark:` works inside) — and a tiny script that applies the
 * saved choice before the first paint, so the page never flashes the wrong theme.
 */
export default function SrRoot({ children }: { children: React.ReactNode }) {
  const css = `.sr{${block(themeCssVars(SAAS_THEME))}}.sr[data-theme="dark"]{${block(themeCssVars(SAAS_THEME, true))}}`;
  const init = `try{var t=localStorage.getItem("sr-theme");if(t==="dark"){var r=document.currentScript.parentElement;r.setAttribute("data-theme","dark");r.classList.add("dark")}}catch(e){}`;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <SrShell script={<script dangerouslySetInnerHTML={{ __html: init }} />}>{children}</SrShell>
    </>
  );
}
