"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setAttendanceAction(formData: FormData) {
  await requireRole("planillero");
  const matchPlayerId = formData.get("matchPlayerId")?.toString();
  const attendanceStatus = formData.get("attendanceStatus")?.toString();
  const matchId = formData.get("matchId")?.toString();

  if (!matchPlayerId || !attendanceStatus) {
    throw new Error("ID de participación y estado de asistencia requeridos");
  }

  if (!["pending", "present", "absent"].includes(attendanceStatus)) {
    throw new Error("Estado de asistencia no válido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_match_attendance", {
    requested_match_player_id: matchPlayerId,
    requested_attendance_status: attendanceStatus,
  });

  if (error) {
    throw new Error(error.message || "Error al actualizar asistencia");
  }

  if (matchId) {
    revalidatePath(`/planillero/${matchId}`);
    revalidatePath(`/admin/partidos/${matchId}`);
  }
  revalidatePath("/planillero");
}

export async function recordPaymentAction(formData: FormData) {
  await requireRole("planillero");
  const matchPlayerId = formData.get("matchPlayerId")?.toString();
  const amountRaw = formData.get("amount")?.toString();
  const method = formData.get("method")?.toString()?.trim();
  const note = formData.get("note")?.toString()?.trim() || null;
  const matchId = formData.get("matchId")?.toString();

  if (!matchPlayerId || !amountRaw || !method) {
    throw new Error("Jugador, monto y método de pago requeridos");
  }

  const validMethods = ["cash", "transfer", "mercadopago", "other"];
  if (!validMethods.includes(method)) {
    throw new Error("Método de pago no válido");
  }

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("El monto a registrar debe ser mayor a 0");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_match_payment", {
    requested_match_player_id: matchPlayerId,
    requested_amount: amount,
    requested_method: method,
    requested_note: note,
  });

  if (error) {
    throw new Error(error.message || "Error al registrar el pago");
  }

  if (matchId) {
    revalidatePath(`/planillero/${matchId}`);
    revalidatePath(`/admin/partidos/${matchId}`);
  }
  revalidatePath("/planillero");
}

export async function startMatchAction(formData: FormData) {
  await requireRole("planillero");
  const matchId = formData.get("matchId")?.toString();

  if (!matchId) {
    throw new Error("ID de partido requerido");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("start_match_v1", {
    requested_match_id: matchId,
  });

  if (error) {
    throw new Error(error.message || "Error al iniciar el partido");
  }

  revalidatePath(`/planillero/${matchId}`);
  revalidatePath("/planillero");
  revalidatePath("/partidos");
  revalidatePath(`/admin/partidos/${matchId}`);
}

export async function completeMatchAction(formData: FormData) {
  await requireRole("planillero");
  const matchId = formData.get("matchId")?.toString();
  const homeScoreRaw = formData.get("homeScore")?.toString();
  const awayScoreRaw = formData.get("awayScore")?.toString();

  if (!matchId) {
    throw new Error("ID de partido requerido");
  }

  const homeScore = parseInt(homeScoreRaw || "0", 10);
  const awayScore = parseInt(awayScoreRaw || "0", 10);

  if (isNaN(homeScore) || homeScore < 0 || isNaN(awayScore) || awayScore < 0) {
    throw new Error("Los goles deben ser números enteros mayores o iguales a 0");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_match_v1", {
    requested_match_id: matchId,
    requested_home_score: homeScore,
    requested_away_score: awayScore,
  });

  if (error) {
    throw new Error(error.message || "Error al finalizar el partido");
  }

  revalidatePath(`/planillero/${matchId}`);
  revalidatePath("/planillero");
  revalidatePath("/partidos");
  revalidatePath(`/admin/partidos/${matchId}`);
}

export async function recordTeamPaymentAction(formData: FormData) {
  await requireRole("planillero");
  const financialId = formData.get("financialId")?.toString();
  const amountRaw = formData.get("amount")?.toString();
  const method = formData.get("method")?.toString()?.trim();
  const note = formData.get("note")?.toString()?.trim() || null;
  const matchId = formData.get("matchId")?.toString();

  if (!financialId || !amountRaw || !method) {
    throw new Error("Cuenta del equipo, monto y método de pago requeridos");
  }

  const validMethods = ["cash", "transfer", "mercadopago", "other"];
  if (!validMethods.includes(method)) {
    throw new Error("Método de pago no válido");
  }

  const amount = parseFloat(amountRaw);
  if (isNaN(amount) || amount <= 0) {
    throw new Error("El monto a registrar debe ser mayor a 0");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_match_team_payment", {
    requested_financial_id: financialId,
    requested_amount: amount,
    requested_method: method,
    requested_paid_by_user_id: null,
    requested_note: note,
  });

  if (error) {
    throw new Error(error.message || "Error al registrar el pago del equipo");
  }

  if (matchId) {
    revalidatePath(`/planillero/${matchId}`);
    revalidatePath(`/admin/partidos/${matchId}`);
  }
  revalidatePath("/planillero");
  revalidatePath("/coach");
}
