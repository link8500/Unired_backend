/** Configuración del proceso: se comprueba antes de abrir el servidor. */
export function validateRuntime(): void {
  for (const [key, fallback, max] of [
    ['PORT', '3000', 65535],
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
