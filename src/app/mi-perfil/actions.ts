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

export async function requestNewPlayerRegistration(formData: FormData) {
  await requireUser();

  const displayName = formData.get("displayName")?.toString().trim();
  const position = formData.get("position")?.toString().trim();
  const categoryRaw = formData.get("category")?.toString().trim();
  const category = categoryRaw && categoryRaw.length > 0 ? categoryRaw : null;

  if (!displayName) {
    throw new Error("El nombre y apellido es obligatorio");
  }

  if (!position) {
    throw new Error("La posición es obligatoria");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_new_player_registration", {
    requested_display_name: displayName,
    requested_position: position,
    requested_category: category,
  });

  if (error) {
    throw new Error(error.message || "Error al solicitar alta de jugador");
  }

  revalidatePath("/mi-perfil");
}

export async function cancelNewPlayerRegistration(formData: FormData) {
  await requireUser();

  const requestId = formData.get("requestId")?.toString();
  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_new_player_registration", {
    requested_request_id: requestId,
  });

  if (error) {
    throw new Error(error.message || "Error al cancelar solicitud");
  }

  revalidatePath("/mi-perfil");
}

