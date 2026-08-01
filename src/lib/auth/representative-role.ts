import type { Database } from "@/types/database";

export const representativeProfileRole = "driver" satisfies Database["public"]["Enums"]["app_role"];

export function isRepresentativeProfileRole(role: Database["public"]["Enums"]["app_role"]) {
  return role === representativeProfileRole;
}
