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

export async function createFriendlyMatch(formData: FormData) {
  await requireRole("admin");

  const date = formData.get("date")?.toString();
  const time = formData.get("time")?.toString();
  const venueName = formData.get("venue_name")?.toString()?.trim() || null;
  const pitch = formData.get("pitch")?.toString()?.trim() || null;
  const playerPriceRaw = formData.get("player_price")?.toString();
  const maxPlayersRaw = formData.get("max_players")?.toString();

  if (!date || !time) {
    throw new Error("Fecha y hora son obligatorias");
  }

  const playerPrice = playerPriceRaw ? parseFloat(playerPriceRaw) : NaN;
  if (isNaN(playerPrice) || playerPrice < 0) {
    throw new Error("El precio por jugador debe ser un número válido mayor o igual a 0");
  }

  const maxPlayers = maxPlayersRaw ? parseInt(maxPlayersRaw, 10) : NaN;
  if (isNaN(maxPlayers) || maxPlayers <= 0) {
    throw new Error("El cupo máximo de jugadores debe ser mayor a 0");
  }

  const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

  const supabase = await createClient();
  const { data: newMatchId, error } = await supabase.rpc("create_match_v1", {
    requested_match_type: "friendly",
    requested_scheduled_at: scheduledAt,
    requested_player_price: playerPrice,
    requested_venue_name: venueName,
    requested_pitch: pitch,
    requested_max_players: maxPlayers,
  });

  if (error) {
    throw new Error(error.message || "Error al crear el partido amistoso");
  }

  revalidatePath("/admin");
  revalidatePath("/partidos");
}

export async function publishMatch(formData: FormData) {
  await requireRole("admin");
  const matchId = formData.get("matchId")?.toString();

  if (!matchId) {
    throw new Error("ID de partido requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("publish_match_v1", {
    requested_match_id: matchId,
  });

  if (error) {
    throw new Error(error.message || "Error al publicar partido");
  }

  revalidatePath("/admin");
  revalidatePath("/partidos");
  revalidatePath(`/admin/partidos/${matchId}`);
}

export async function assignScorekeeper(formData: FormData) {
  await requireRole("admin");
  const matchId = formData.get("matchId")?.toString();
  const userId = formData.get("userId")?.toString();

  if (!matchId || !userId) {
    throw new Error("ID de partido y usuario requeridos");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_match_scorekeeper", {
    requested_match_id: matchId,
    requested_user_id: userId,
  });

  if (error) {
    throw new Error(error.message || "Error al asignar planillero");
  }

  revalidatePath("/admin");
  revalidatePath("/planillero");
  revalidatePath(`/admin/partidos/${matchId}`);
}

export async function removeScorekeeper(formData: FormData) {
  await requireRole("admin");
  const matchId = formData.get("matchId")?.toString();

  if (!matchId) {
    throw new Error("ID de partido requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_match_scorekeeper", {
    requested_match_id: matchId,
  });

  if (error) {
    throw new Error(error.message || "Error al quitar planillero");
  }

  revalidatePath("/admin");
  revalidatePath("/planillero");
  revalidatePath(`/admin/partidos/${matchId}`);
}

export async function grantMatchWaiverAction(formData: FormData) {
  await requireRole("admin");
  const matchPlayerId = formData.get("matchPlayerId")?.toString();
  const amountRaw = formData.get("amount")?.toString();
  const note = formData.get("note")?.toString()?.trim() || null;
  const matchId = formData.get("matchId")?.toString();

  if (!matchPlayerId || !amountRaw) {
    throw new Error("Jugador y monto de cortesía requeridos");
  }

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("El monto de la cortesía debe ser mayor a 0");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("grant_match_waiver", {
    requested_match_player_id: matchPlayerId,
    requested_amount: amount,
    requested_note: note,
  });

  if (error) {
    throw new Error(error.message || "Error al registrar cortesía");
  }

  if (matchId) {
    revalidatePath(`/admin/partidos/${matchId}`);
    revalidatePath(`/planillero/${matchId}`);
  }
  revalidatePath("/admin");
  revalidatePath("/planillero");
}

export async function voidMatchPaymentAction(formData: FormData) {
  await requireRole("admin");
  const paymentId = formData.get("paymentId")?.toString();
  const reason = formData.get("reason")?.toString()?.trim();
  const matchId = formData.get("matchId")?.toString();

  if (!paymentId || !reason) {
    throw new Error("ID de pago y motivo de anulación requeridos");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_match_payment", {
    requested_payment_id: paymentId,
    requested_reason: reason,
  });

  if (error) {
    throw new Error(error.message || "Error al anular movimiento de pago");
  }

  if (matchId) {
    revalidatePath(`/admin/partidos/${matchId}`);
    revalidatePath(`/planillero/${matchId}`);
  }
  revalidatePath("/admin");
  revalidatePath("/planillero");
}



