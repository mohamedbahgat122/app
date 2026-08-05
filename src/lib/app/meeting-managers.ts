import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServerSupabaseClient = SupabaseClient<Database>;

export type MeetingManagerOption = {
  id: string;
  displayName: string | null;
  jobTitle: string | null;
};

export async function loadMeetingManagerOptions(
  supabase: ServerSupabaseClient,
): Promise<MeetingManagerOption[]> {
  const { data, error } = await supabase.rpc(
    "list_driver_meeting_manager_options",
  );

  if (error) {
    return [];
  }

  return (data ?? []).map((option) => ({
    id: option.profile_id,
    displayName: cleanManagementLabelValue(option.display_name),
    jobTitle: cleanManagementLabelValue(option.job_title),
  }));
}

function cleanManagementLabelValue(value: string | null) {
  const cleaned = value?.trim();

  return cleaned ? cleaned : null;
}
