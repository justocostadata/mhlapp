"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function joinFriendlyMatch(formData: FormData) {
  await requireUser();
  const matchId = formData.get("matchId")?.toString();

  if (!matchId) {
    throw new Error("ID de partido requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("join_friendly_match", {
    requested_match_id: matchId,
  });

  if (error) {
    throw new Error(error.message || "Error al anotarse al partido");
  }

  revalidatePath("/partidos");
  revalidatePath("/mi-perfil");
  revalidatePath(`/planillero/${matchId}`);
}

export async function respondMatchParticipation(formData: FormData) {
  await requireUser();
  const matchPlayerId = formData.get("matchPlayerId")?.toString();
  const decision = formData.get("decision")?.toString();

  if (!matchPlayerId || !decision) {
    throw new Error("ID de participación y decisión requeridos");
  }

  if (decision !== "confirm" && decision !== "cancel") {
    throw new Error("Decisión no válida");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_match_participation", {
    requested_match_player_id: matchPlayerId,
    requested_decision: decision,
  });

  if (error) {
    throw new Error(error.message || "Error al actualizar estado de participación");
  }

  revalidatePath("/partidos");
  revalidatePath("/mi-perfil");
  revalidatePath("/coach");
  revalidatePath("/planillero");
}
