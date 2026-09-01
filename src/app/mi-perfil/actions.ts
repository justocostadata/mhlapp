"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function requestPlayerClaim(formData: FormData) {
  await requireUser();
  const playerId = formData.get("playerId")?.toString();

  if (!playerId) {
    throw new Error("ID de jugador requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_player_claim", {
    requested_player_id: playerId,
  });

  if (error) {
    throw new Error(error.message || "Error al solicitar vinculación");
  }

  revalidatePath("/mi-perfil");
}

export async function cancelPlayerClaim(formData: FormData) {
  await requireUser();
  const claimId = formData.get("claimId")?.toString();

  if (!claimId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_player_claim", {
    requested_claim_id: claimId,
  });

  if (error) {
    throw new Error(error.message || "Error al cancelar solicitud");
  }

  revalidatePath("/mi-perfil");
}
