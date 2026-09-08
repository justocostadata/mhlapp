"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requestAddPlayer(formData: FormData) {
  await requireRole("coach");
  const playerId = formData.get("playerId")?.toString();
  const reason = formData.get("reason")?.toString()?.trim() || null;

  if (!playerId) {
    throw new Error("ID de jugador requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_team_roster_change", {
    requested_player_id: playerId,
    requested_request_type: "add",
    requested_reason: reason,
  });

  if (error) {
    throw new Error(error.message || "Error al solicitar incorporación de jugador");
  }

  revalidatePath("/coach");
  revalidatePath("/admin");
  revalidatePath("/equipos");
}

export async function requestRemovePlayer(formData: FormData) {
  await requireRole("coach");
  const playerId = formData.get("playerId")?.toString();
  const reason = formData.get("reason")?.toString()?.trim() || null;

  if (!playerId) {
    throw new Error("ID de jugador requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_team_roster_change", {
    requested_player_id: playerId,
    requested_request_type: "remove",
    requested_reason: reason,
  });

  if (error) {
    throw new Error(error.message || "Error al solicitar baja de jugador");
  }

  revalidatePath("/coach");
  revalidatePath("/admin");
  revalidatePath("/equipos");
}

export async function cancelRosterRequest(formData: FormData) {
  await requireRole("coach");
  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_team_roster_request", {
    requested_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message || "Error al cancelar solicitud");
  }

  revalidatePath("/coach");
  revalidatePath("/admin");
}
