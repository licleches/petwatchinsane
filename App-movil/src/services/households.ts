import { isSupportedTimeZone } from '@/constants/options';
import { supabase } from '@/services/supabase';
import type { HouseholdMember, HouseholdRow, HouseholdWithRole } from '@/types/database';
import { logSupabaseError } from '@/utils/errors';
import { isValidInviteCode, normalizeInviteCode } from '@/utils/validation';

export async function getMyHouseholds(userId: string): Promise<HouseholdWithRole[]> {
  const { data: memberships, error: membershipsError } = await supabase
    .from('hogar_miembros')
    .select('*')
    .eq('usuario_id', userId);
  if (membershipsError) {
    logSupabaseError('hogar_miembros.selectMine', membershipsError, { userId });
    throw membershipsError;
  }
  if (!memberships?.length) return [];

  const { data: households, error: householdsError } = await supabase
    .from('hogares')
    .select('*')
    .in('id', memberships.map((membership) => membership.hogar_id))
    .order('creado_en');
  if (householdsError) {
    logSupabaseError('hogares.selectMine', householdsError, { userId });
    throw householdsError;
  }

  const roleByHousehold = new Map(memberships.map((membership) => [membership.hogar_id, membership.rol]));
  return (households ?? []).map((household) => ({
    ...household,
    rol: roleByHousehold.get(household.id) ?? 'miembro',
  }));
}

export async function getHouseholdMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data: members, error: membersError } = await supabase
    .from('hogar_miembros')
    .select('*')
    .eq('hogar_id', householdId)
    .order('creado_en');
  if (membersError) {
    logSupabaseError('hogar_miembros.selectHousehold', membersError, { householdId });
    throw membersError;
  }
  if (!members?.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .in('id', members.map((member) => member.usuario_id));
  if (profilesError) {
    logSupabaseError('perfiles.selectMembers', profilesError, { householdId });
    throw profilesError;
  }

  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.nombre]));
  return members.map((member) => ({
    ...member,
    nombre: names.get(member.usuario_id)?.trim() || 'Miembro',
  }));
}

function validateHouseholdValues(nombre: string, zonaHoraria: string) {
  const trimmed = nombre.trim();
  if (!trimmed) throw new Error('El nombre del hogar no puede estar vacío.');
  if (trimmed.length > 80) throw new Error('El nombre del hogar no puede superar 80 caracteres.');
  if (!isSupportedTimeZone(zonaHoraria)) throw new Error('La zona horaria seleccionada no es válida.');
  return trimmed;
}

export async function createHousehold(nombre: string, zonaHoraria: string) {
  const trimmed = validateHouseholdValues(nombre, zonaHoraria);
  const { data, error } = await supabase.rpc('crear_hogar', { p_nombre: trimmed, p_zona_horaria: zonaHoraria });
  if (error) {
    logSupabaseError('rpc.crear_hogar', error);
    throw error;
  }
  if (typeof data !== 'string') throw new Error('Supabase no devolvió el hogar creado.');
  return data;
}

export async function updateHousehold(householdId: string, values: { nombre: string; zona_horaria: string }): Promise<HouseholdRow> {
  const nombre = validateHouseholdValues(values.nombre, values.zona_horaria);
  const { data, error } = await supabase
    .from('hogares')
    .update({ nombre, zona_horaria: values.zona_horaria })
    .eq('id', householdId)
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('hogares.update', error, { householdId });
    throw error;
  }
  if (!data) throw new Error('No se pudo actualizar el hogar. Verifica que sigas siendo miembro.');
  return data;
}

export async function generateInviteCode(householdId: string) {
  const { data, error } = await supabase.rpc('generar_codigo_invitacion', { p_hogar_id: householdId });
  if (error) {
    logSupabaseError('rpc.generar_codigo_invitacion', error, { householdId });
    throw error;
  }
  if (typeof data !== 'string') throw new Error('Supabase no devolvió el código de invitación.');
  return data;
}

export async function joinHouseholdWithCode(code: string) {
  if (!isValidInviteCode(code)) throw new Error('El código debe tener 8 caracteres.');
  const { data, error } = await supabase.rpc('unirse_hogar', { p_codigo: normalizeInviteCode(code) });
  if (error) {
    logSupabaseError('rpc.unirse_hogar', error);
    throw error;
  }
  if (typeof data !== 'string') throw new Error('No se pudo completar la unión al hogar.');
  return data;
}
