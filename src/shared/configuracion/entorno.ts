// Archivo: src/shared/configuracion/entorno.ts
// Valida los parámetros necesarios para ejecutar la API y las reglas de verificación de correo.

/** Configuración del proceso: se comprueba antes de abrir el servidor. */
export function frontendOrigin(): string | undefined {
  const value =
    process.env.FRONTEND_URL?.trim() ||
    process.env.CORS_ORIGINS?.split(',')
      .map((x) => x.trim())
      .find(Boolean);
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/' ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      throw new Error();
    return url.origin;
  } catch {
    throw new Error(
      'FRONTEND_URL debe ser el origen HTTP/HTTPS de UniRed, sin ruta ni credenciales.',
    );
  }
}

export function emailVerificationRequired(): boolean {
  const value = process.env.REQUIRE_EMAIL_VERIFICATION ?? 'true';
  if (!['true', 'false'].includes(value))
    throw new Error('REQUIRE_EMAIL_VERIFICATION debe ser true o false.');
  if (
    value === 'false' &&
    !['development', 'test'].includes(process.env.NODE_ENV ?? '')
  )
    throw new Error(
      'Solo se permite desactivar la verificación de correo en development o test.',
    );
  return value === 'true';
}

export function validateRuntime(): void {
  emailVerificationRequired();
  frontendOrigin();
  for (const [key, fallback, max] of [
    ['PORT', '3000', 65535],
    ['SSE_MAX_USERS', '200', 10000],
    ['MEDIA_MAX_JOBS', '1', 4],
    ['UPLOAD_IMAGE_MAX_BYTES', '10485760', 104857600],
    ['UPLOAD_DOCUMENT_MAX_BYTES', '20971520', 104857600],
    ['UPLOAD_VIDEO_MAX_BYTES', '1073741824', 10737418240],
    ['UPLOAD_OWNER_MAX_BYTES', '5368709120', 1099511627776],
  ] as const) {
    const value = Number(process.env[key] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error('Configuración inválida: ' + key);
  }
  if (
    !process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_ACCESS_SECRET.length < 32
  )
    throw new Error('Ejecuta npm run setup:env antes de arrancar la API.');
  if (!/^[0-9a-f]{64}$/i.test(process.env.MAIL_ENCRYPTION_KEY ?? ''))
    throw new Error('MAIL_ENCRYPTION_KEY inválida. Ejecuta npm run setup:env.');
}
