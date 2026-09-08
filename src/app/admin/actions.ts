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

export async function approveNewPlayerRegistration(formData: FormData) {
  await requireRole("admin");
  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_new_player_registration", {
    requested_request_id: requestId,
    decision: "approved",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al aprobar registro de jugador");
  }

  revalidatePath("/admin");
  revalidatePath("/mi-perfil");
}

export async function rejectNewPlayerRegistration(formData: FormData) {
  await requireRole("admin");
  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_new_player_registration", {
    requested_request_id: requestId,
    decision: "rejected",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al rechazar registro de jugador");
  }

  revalidatePath("/admin");
  revalidatePath("/mi-perfil");
}

export async function assignCoach(formData: FormData) {
  await requireRole("admin");
  const teamId = formData.get("teamId")?.toString();
  const userId = formData.get("userId")?.toString();

  if (!teamId || !userId) {
    throw new Error("Equipo y usuario son requeridos");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_team_coach", {
    requested_team_id: teamId,
    requested_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || "Error al asignar coach");
  }

  revalidatePath("/admin");
  revalidatePath("/equipos");
  revalidatePath("/coach");
}

export async function removeCoach(formData: FormData) {
  await requireRole("admin");
  const teamCoachId = formData.get("teamCoachId")?.toString();

  if (!teamCoachId) {
    throw new Error("ID de coach requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_team_coach", {
    requested_team_coach_id: teamCoachId,
  });

  if (error) {
    throw new Error(error.message || "Error al quitar coach");
  }

  revalidatePath("/admin");
  revalidatePath("/equipos");
  revalidatePath("/coach");
}

export async function approveRosterRequest(formData: FormData) {
  await requireRole("admin");
  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_team_roster_request", {
    requested_request_id: requestId,
    decision: "approved",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al aprobar solicitud de plantilla");
  }

  revalidatePath("/admin");
  revalidatePath("/coach");
  revalidatePath("/equipos");
  revalidatePath("/mi-perfil");
}

export async function rejectRosterRequest(formData: FormData) {
  await requireRole("admin");
  const requestId = formData.get("requestId")?.toString();

  if (!requestId) {
    throw new Error("ID de solicitud requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_team_roster_request", {
    requested_request_id: requestId,
    decision: "rejected",
    notes: null,
  });

  if (error) {
    throw new Error(error.message || "Error al rechazar solicitud de plantilla");
  }

  revalidatePath("/admin");
  revalidatePath("/coach");
  revalidatePath("/equipos");
  revalidatePath("/mi-perfil");
}


