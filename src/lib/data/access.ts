import { supabase } from "@/lib/supabase/client";

/**
 * New accounts wait for an admin's approval (migration
 * 20261125210000_access_requests.sql). The database enforces it; these
 * only show where the user stands and let admins decide.
 */

export type AccessStatus = "approved" | "pending" | "rejected";
export type Access = { status: AccessStatus; isAdmin: boolean };

export type AccessRequest = {
  userId: string;
  email: string | null;
  name: string | null;
  requestedAt: string;
  status: AccessStatus;
};

export async function getMyAccess(): Promise<Access> {
  const { data, error } = await supabase().rpc("my_access");
  if (error) throw error;
  const row = data[0];
  return {
    status: (row?.status as AccessStatus) ?? "pending",
    isAdmin: row?.is_admin ?? false,
  };
}

/** The name an admin sees on the request. */
export async function saveMyName(name: string) {
  const user = (await supabase().auth.getUser()).data.user;
  if (!user) return;
  const { error } = await supabase()
    .from("profiles")
    .update({ display_name: name.trim().slice(0, 60) })
    .eq("id", user.id);
  if (error) throw error;
}

export async function getMyName(): Promise<string> {
  const user = (await supabase().auth.getUser()).data.user;
  if (!user) return "";
  const { data } = await supabase()
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  return data?.display_name ?? "";
}

/** Admins: who asked to join (pending first), and who was decided lately. */
export async function getAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await supabase().rpc("access_requests");
  if (error) throw error;
  return data.map((r) => ({
    userId: r.user_id,
    email: r.email,
    name: r.display_name,
    requestedAt: r.requested_at,
    status: r.status as AccessStatus,
  }));
}

export async function decideAccess(userId: string, approve: boolean) {
  const { error } = await supabase().rpc("decide_access", {
    p_user: userId,
    p_approve: approve,
  });
  if (error) throw error;
}
