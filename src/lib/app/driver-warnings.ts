import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;
type DriverWarningRow = Database["public"]["Tables"]["driver_warnings"]["Row"];

export type DriverWarning = {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  incidentAt: string;
  status: string;
  issuedAt: string;
  driverSeenAt: string | null;
  revokedAt: string | null;
  revokeReason: string | null;
  createdAt: string;
};

export async function loadDriverWarnings({
  supabase,
  driverId,
}: {
  supabase: ServerSupabaseClient;
  driverId: string;
}) {
  const { data } = await supabase
    .from("driver_warnings")
    .select(
      "id, category, severity, title, description, incident_at, status, issued_at, driver_seen_at, revoked_at, revoke_reason, created_at",
    )
    .eq("driver_id", driverId)
    .order("issued_at", { ascending: false });

  return ((data ?? []) as DriverWarningRow[]).map(mapWarning);
}

export async function loadDriverWarning({
  supabase,
  warningId,
}: {
  supabase: ServerSupabaseClient;
  warningId: string;
}) {
  const { data } = await supabase
    .from("driver_warnings")
    .select(
      "id, category, severity, title, description, incident_at, status, issued_at, driver_seen_at, revoked_at, revoke_reason, created_at",
    )
    .eq("id", warningId)
    .maybeSingle();

  return data ? mapWarning(data as DriverWarningRow) : null;
}

export async function markDriverWarningSeen({
  supabase,
  warningId,
}: {
  supabase: ServerSupabaseClient;
  warningId: string;
}) {
  await supabase.rpc("mark_driver_warning_seen", {
    p_warning_id: warningId,
  });
}

function mapWarning(row: DriverWarningRow): DriverWarning {
  return {
    id: row.id,
    category: row.category,
    severity: row.severity,
    title: row.title,
    description: row.description,
    incidentAt: row.incident_at,
    status: row.status,
    issuedAt: row.issued_at,
    driverSeenAt: row.driver_seen_at,
    revokedAt: row.revoked_at,
    revokeReason: row.revoke_reason,
    createdAt: row.created_at,
  };
}
