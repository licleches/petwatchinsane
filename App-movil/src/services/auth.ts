import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { isSupportedTimeZone } from '@/constants/options';
import { logSupabaseClientConfig, supabase } from '@/services/supabase';
import type { ProfileRow } from '@/types/database';
import { logSupabaseDiagnostic, logSupabaseError, logSupabaseNoRows } from '@/utils/errors';

export async function signInWithPassword(email: string, password: string) {
  return supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
}

export async function registerUser({
  nombre,
  email,
  password,
  zonaHoraria,
}: {
  nombre: string;
  email: string;
  password: string;
  zonaHoraria: string;
}) {
  // El trigger de la base de datos crea el perfil y el hogar con estos metadatos.
  return supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        nombre: nombre.trim(),
        zona_horaria: zonaHoraria,
      },
    },
  });
}

/**
 * URL a la que vuelve el enlace del correo de recuperación. En Expo Go es
 * exp://<ip>:<puerto>/--/reset-password; en una build, petwatch://reset-password.
 * Debe estar en Authentication > URL Configuration > Redirect URLs de Supabase.
 */
export function getPasswordResetRedirectUrl() {
  return Linking.createURL('/reset-password');
}

export async function sendPasswordReset(email: string) {
  return supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: getPasswordResetRedirectUrl(),
  });
}

export async function updatePassword(password: string) {
  return supabase.auth.updateUser({ password });
}

type AuthLinkParams = {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  errorDescription: string | null;
};

/** Lee los parámetros que Supabase agrega al enlace (en la query o en el fragmento #). */
export function parseAuthLink(url: string): AuthLinkParams {
  const params = new Map<string, string>();
  const hashIndex = url.indexOf('#');
  const beforeHash = hashIndex >= 0 ? url.slice(0, hashIndex) : url;
  const hash = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const queryIndex = beforeHash.indexOf('?');
  const query = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  for (const section of [query, hash]) {
    for (const pair of section.split('&')) {
      if (!pair) continue;
      const separator = pair.indexOf('=');
      const rawKey = separator >= 0 ? pair.slice(0, separator) : pair;
      const rawValue = separator >= 0 ? pair.slice(separator + 1) : '';
      try {
        params.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue.replace(/\+/g, ' ')));
      } catch {
        // Ignora parámetros mal codificados.
      }
    }
  }

  return {
    accessToken: params.get('access_token') ?? null,
    refreshToken: params.get('refresh_token') ?? null,
    code: params.get('code') ?? null,
    errorDescription: params.get('error_description') ?? params.get('error') ?? null,
  };
}

/** Crea la sesión a partir del enlace de recuperación. Devuelve null si el enlace no trae credenciales. */
export async function createSessionFromAuthLink(url: string) {
  const { accessToken, refreshToken, code, errorDescription } = parseAuthLink(url);
  if (errorDescription) {
    throw new Error(errorDescription);
  }
  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return data.session;
  }
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return data.session;
  }
  return null;
}

export class UserProfileNotFoundError extends Error {
  readonly code = 'PROFILE_NOT_FOUND';
  readonly userId: string;

  constructor(userId: string) {
    super('No se encontró el perfil del usuario autenticado.');
    this.name = 'UserProfileNotFoundError';
    this.userId = userId;
  }
}

export async function getAuthenticatedUser() {
  logSupabaseClientConfig();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    logSupabaseError('auth.getSession', sessionError);
    throw sessionError;
  }
  if (!sessionData.session?.user) {
    throw new Error('No hay una sesión autenticada. Inicia sesión para continuar.');
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) {
    logSupabaseError('auth.getUser', userError);
    throw userError;
  }
  if (!userData.user) {
    throw new Error('No se pudo validar el usuario autenticado. Inicia sesión nuevamente.');
  }
  if (userData.user.id !== sessionData.session.user.id) {
    throw new Error('La sesión autenticada no coincide con el usuario actual. Inicia sesión nuevamente.');
  }

  logSupabaseDiagnostic('auth.getUser.result', {
    hasSession: 'true',
    userId: userData.user.id,
  });

  return userData.user;
}

export async function getUserProfile(user: Pick<User, 'id'>) {
  const { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
  if (error) {
    logSupabaseError('perfiles.selectProfile', error, { userId: user.id });
    throw error;
  }
  if (!data) {
    logSupabaseNoRows('perfiles.selectProfile', { userId: user.id });
    return null;
  }
  if (data.id !== user.id) {
    throw new Error('El perfil devuelto no coincide con el usuario autenticado.');
  }
  return data;
}

export async function syncUserProfile(user: User): Promise<ProfileRow> {
  const authenticatedUser = await getAuthenticatedUser();
  if (authenticatedUser.id !== user.id) {
    throw new Error('La sesión autenticada no coincide con el usuario actual.');
  }

  // El trigger de registro crea el perfil; se reintenta por si la lectura llega antes.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await getUserProfile(authenticatedUser);
    if (existing) return existing;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  throw new UserProfileNotFoundError(authenticatedUser.id);
}

export async function updateUserProfile(values: { nombre: string; zona_horaria: string }) {
  const user = await getAuthenticatedUser();
  const nombre = values.nombre.trim();
  if (!nombre) throw new Error('El nombre no puede estar vacío.');
  if (nombre.length > 80) throw new Error('El nombre no puede superar 80 caracteres.');
  if (!isSupportedTimeZone(values.zona_horaria)) {
    throw new Error('La zona horaria seleccionada no es válida.');
  }

  const { data, error } = await supabase
    .from('perfiles')
    .update({ nombre, zona_horaria: values.zona_horaria })
    .eq('id', user.id)
    .select()
    .maybeSingle();
  if (error) {
    logSupabaseError('perfiles.updateProfile', error, { userId: user.id });
    throw error;
  }
  if (!data) {
    logSupabaseNoRows('perfiles.updateProfile', { userId: user.id });
    throw new UserProfileNotFoundError(user.id);
  }
  return data;
}

export function getFallbackName(user: User | null) {
  const name = user?.user_metadata?.nombre;
  return typeof name === 'string' && name.trim() ? name.trim() : 'Usuario';
}
