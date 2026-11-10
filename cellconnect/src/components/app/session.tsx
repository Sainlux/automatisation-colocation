"use client";

import { createContext, useContext } from "react";
import type { OrgRole, Profile } from "@/lib/types";

export interface Me {
  profile: Profile;
  organization: { id: string; name: string } | null;
  role: OrgRole;
  organizations: { id: string; name: string; role: OrgRole }[];
  integrations: {
    dataBackend: "local" | "supabase";
    ai: { available: boolean; provider?: string; model?: string };
    email: { available: boolean };
    google: { available: boolean };
    outlook: { available: boolean; reason?: string };
    zoom: { available: boolean; reason?: string };
    push: { available: boolean; reason?: string };
  };
}

export const MeContext = createContext<{ me: Me; reload: () => void; counters: { notifications: number; conflicts: number; invitations: number }; refreshCounters: () => void } | null>(null);

export function useMe() {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe hors du shell applicatif");
  return v;
}

export const isAdmin = (role: OrgRole) => role === "org_admin" || role === "super_admin";
export const canLead = (role: OrgRole) => isAdmin(role) || role === "group_leader";
