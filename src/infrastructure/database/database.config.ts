import { DataSourceOptions } from 'typeorm';

type PostgresConnectionOptions = Extract<DataSourceOptions, { type: 'postgres' }>;

/** La URL de producción tiene prioridad; los parámetros DB_* conservan el
 * arranque local. Las credenciales nunca forman parte de los mensajes de error.
 * Se separa la URL para impedir que pg sustituya la verificación TLS al leer
 * sslmode=require de una cadena de conexión. */
export function databaseConnection(
  env: Record<string, string | undefined> = process.env,
): PostgresConnectionOptions {
  let host = env.DB_HOST ?? '127.0.0.1';
  let port = Number(env.DB_PORT ?? 5433);
  let username = env.DB_USER ?? 'unired';
  let password = env.DB_PASSWORD;
  let database = env.DB_NAME ?? 'unired';
  let ssl = false;
  let channelBinding = false;
  if (env.DB_SSL !== undefined && !['true', 'false'].includes(env.DB_SSL))
    throw new Error('DB_SSL debe ser true o false.');
  ssl = env.DB_SSL === 'true';
  if (env.DATABASE_URL?.trim()) {
    try {
      const url = new URL(env.DATABASE_URL.trim());
      if (!['postgres:', 'postgresql:'].includes(url.protocol))
        throw new Error();
      host = url.hostname;
      port = Number(url.port || 5432);
      username = decodeURIComponent(url.username);
      password = decodeURIComponent(url.password);
      database = decodeURIComponent(url.pathname.slice(1));
      const mode = url.searchParams.get('sslmode') ?? 'verify-full';
      if (!['require', 'verify-ca', 'verify-full', 'disable'].includes(mode))
        throw new Error();
      ssl = mode !== 'disable';
      const binding = url.searchParams.get('channel_binding');
      if (binding && !['require', 'prefer', 'disable'].includes(binding))
        throw new Error();
      channelBinding = binding === 'require' || binding === 'prefer';
      if (
        !host ||
        !username ||
        !password ||
        !database ||
        (channelBinding && !ssl)
      )
        throw new Error();
    } catch {
      throw new Error(
        'DATABASE_URL inválida. Usa la conexión PostgreSQL de tu proveedor.',
      );
    }
  }
  if (!password || password === 'CAMBIAR_CON_SETUP_ENV')
    throw new Error(
      'Configura DATABASE_URL o los parámetros DB_* de PostgreSQL.',
    );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('DB_PORT inválido.');
  if (env.NODE_ENV === 'production' && !ssl)
    throw new Error('La conexión de producción requiere SSL verificado.');
  return {
    type: 'postgres',
    host,
    port,
    username,
    password,
    database,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    connectTimeoutMS: 15000,
    extra: {
      max: 10,
      options: '-c timezone=UTC',
      ...(channelBinding ? { enableChannelBinding: true } : {}),
    },
  };
}
