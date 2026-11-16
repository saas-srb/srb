"use client";

import UnifiedProfileMenu from "@/components/platform/panel/UnifiedProfileMenu";
import { seoLogoutAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import {  } from "@/lib/seo-roles";

export default function SeoProfileMenu({
  email,
  roles,
  flags = {},
  createdAt,
  lastLoginAt,
}: {
  email: string;
  roles: string[];
  flags?: any;
  createdAt: string;
  lastLoginAt: string | null;
}) {


  return (
    <UnifiedProfileMenu
      email={email}
      createdAt={createdAt}
      lastLoginAt={lastLoginAt}
      onLogout={() => seoLogoutAction()}
      panelName="SEO Management"
    />
  );
}
