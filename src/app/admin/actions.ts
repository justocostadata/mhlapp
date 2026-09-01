"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function approvePlayerClaim(formData: FormData) {
  await requireRole("admin");
  const claimId = formData.get("claimId")?.toString();

  if (!claimId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_player_claim", {
    requested_claim_id: claimId,
    decision: "approved",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al aprobar solicitud");
  }

  revalidatePath("/admin");
  revalidatePath("/mi-perfil");
}

export async function rejectPlayerClaim(formData: FormData) {
  await requireRole("admin");
  const claimId = formData.get("claimId")?.toString();

  if (!claimId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_player_claim", {
    requested_claim_id: claimId,
    decision: "rejected",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al rechazar solicitud");
  }

  revalidatePath("/admin");
  revalidatePath("/mi-perfil");
}
