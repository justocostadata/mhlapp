import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole = "admin" | "coach" | "planillero" | "player";

export async function getAuthContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, roles: [] as AppRole[] };
  }

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  const roles = (roleRows ?? [])
    .map((row) => row.role)
    .filter((role): role is AppRole =>
      ["admin", "coach", "planillero", "player"].includes(role),
    );

  return { user, roles };
}

export async function requireUser() {
  const context = await getAuthContext();
  if (!context.user) redirect("/login");
  return context as { user: NonNullable<typeof context.user>; roles: AppRole[] };
}

export async function requireRole(role: AppRole) {
  const context = await requireUser();
  if (!context.roles.includes(role)) redirect("/");
  return context;
}
