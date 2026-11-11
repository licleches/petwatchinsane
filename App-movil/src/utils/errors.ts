export function getErrorMessage(error: unknown, fallback = 'Ocurrió un error. Intenta nuevamente.') {
  const message = getRawErrorMessage(error);
  const code = getErrorCode(error);
  const normalizedMessage = message?.toLowerCase() ?? '';

  if (code === '42501' || normalizedMessage.includes('row-level security policy') || normalizedMessage.includes('permission denied')) {
    return 'Supabase rechazó la operación por seguridad. Verifica que tu sesión siga activa y que pertenezcas a este hogar.';
  }
  if (code === 'PROFILE_NOT_FOUND') {
    return 'Tu sesión es válida, pero no se encontró tu perfil en public.perfiles. Revisa que la migración de PetWatch esté aplicada en el proyecto de Supabase conectado.';
  }
  if (code === 'PGRST116' || normalizedMessage.includes('cannot coerce the result to a single json object')) {
    return 'Supabase no devolvió un único registro. Actualiza la pantalla e intenta de nuevo.';
  }
  if (code === 'PGRST202' || normalizedMessage.includes('could not find the function')) {
    return 'Falta una función en la base de datos. Aplica la migración de PetWatch en Supabase.';
  }
  if (code === 'PGRST205' || code === '42P01' || normalizedMessage.includes('could not find the table')) {
    return 'Faltan tablas en la base de datos. Aplica la migración de PetWatch en Supabase.';
  }
  if (code === '23505') return 'Ya existe un registro con esos datos.';
  if (code === '23514') return 'Algún dato no es válido. Revisa el formulario e intenta de nuevo.';
  if (code === '23503') return 'El registro relacionado ya no existe. Actualiza la pantalla e intenta de nuevo.';
  if (normalizedMessage.includes('network request failed') || normalizedMessage.includes('failed to fetch')) {
    return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  }
  if (message) return message;

  return fallback;
}

/** Traduce los mensajes más comunes de Supabase Auth, que llegan en inglés. */
export function getAuthErrorMessage(error: unknown, fallback = 'No se pudo completar la operación.') {
  const message = getRawErrorMessage(error)?.toLowerCase() ?? '';
  const code = getErrorCode(error) ?? '';

  if (message.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if (message.includes('email not confirmed')) {
    return 'Tu correo aún no está confirmado. Revisa tu bandeja de entrada o desactiva la confirmación de correo en Supabase.';
  }
  if (message.includes('user already registered') || code === 'user_already_exists') {
    return 'Ya existe una cuenta con ese correo.';
  }
  if (message.includes('password should be at least') || code === 'weak_password') {
    return 'La contraseña debe tener al menos 6 caracteres.';
  }
  if (message.includes('new password should be different')) {
    return 'La nueva contraseña debe ser diferente a la anterior.';
  }
  if (message.includes('rate limit') || code === 'over_email_send_rate_limit') {
    return 'Se enviaron demasiados correos. Espera unos minutos e intenta de nuevo.';
  }
  if (message.includes('for security purposes')) {
    return 'Por seguridad, espera unos segundos antes de volver a intentarlo.';
  }
  if (message.includes('unable to validate email address') || message.includes('invalid format')) {
    return 'El correo electrónico no es válido.';
  }
  if (message.includes('auth session missing') || message.includes('invalid flow state') || message.includes('expired')) {
    return 'El enlace no es válido o ya venció. Solicita uno nuevo.';
  }
  return getErrorMessage(error, fallback);
}

function getRawErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }

  return null;
}

function getErrorCode(error: unknown) {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

/** Registra solo metadatos del error en desarrollo; nunca incluye tokens ni datos de sesión. */
export function logSupabaseError(
  operation: string,
  error: unknown,
  context: Record<string, string | undefined> = {},
) {
  if (process.env.NODE_ENV === 'production') return;

  const details = typeof error === 'object' && error !== null ? error as {
    code?: unknown;
    details?: unknown;
    hint?: unknown;
    message?: unknown;
    status?: unknown;
  } : {};

  console.warn(`[Supabase] ${operation}`, {
    ...context,
    code: typeof details.code === 'string' ? details.code : undefined,
    status: typeof details.status === 'number' ? String(details.status) : undefined,
    message: typeof details.message === 'string' ? details.message : getRawErrorMessage(error),
    details: typeof details.details === 'string' ? details.details : undefined,
    hint: typeof details.hint === 'string' ? details.hint : undefined,
  });
}

export function logSupabaseNoRows(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.warn(`[Supabase] ${operation} returned 0 rows`, context);
}

export function logSupabaseDiagnostic(operation: string, context: Record<string, string | undefined> = {}) {
  if (process.env.NODE_ENV === 'production') return;
  console.info(`[Supabase] ${operation}`, context);
}
