// Configuración exclusivamente del backend. Ningún secreto se entrega a Flutter.
import { ConfiguracionAccesoSocial } from '../../core/dominio/comun/acceso-social';
import { frontendOrigin } from './entorno';

export function configuracionSocial(): ConfiguracionAccesoSocial {
  const desarrollo = process.env.NODE_ENV !== 'production';
  const enabled = !!(
    process.env.GOOGLE_CLIENT_ID || process.env.FACEBOOK_APP_ID
  );
  const api = new URL(
    process.env.API_PUBLIC_URL ||
      `http://localhost:${process.env.PORT || 3000}`,
  );
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.hash ||
    api.search ||
    (enabled && !desarrollo && api.protocol !== 'https:')
  )
    throw new Error(
      'API_PUBLIC_URL debe ser el origen HTTPS público de la API, sin /api/v1.',
    );
  const origenesPermitidos = [
    ...new Set(
      [frontendOrigin(), ...(process.env.CORS_ORIGINS ?? '').split(',')]
        .filter((x): x is string => !!x?.trim())
        .map((x) => x.trim()),
    ),
  ];
  if (enabled && !desarrollo && !process.env.API_PUBLIC_URL)
    throw new Error(
      'Configura API_PUBLIC_URL para activar el acceso social en producción.',
    );
  if (enabled && !desarrollo && !origenesPermitidos.length)
    throw new Error(
      'Configura FRONTEND_URL o CORS_ORIGINS para el acceso social.',
    );
  for (const [id, secret] of [
    ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
    ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  ]) {
    if (Boolean(process.env[id]) !== Boolean(process.env[secret]))
      throw new Error(
        'Completa ' + id + ' y ' + secret + ' para habilitar el proveedor.',
      );
  }
  if (
    process.env.FACEBOOK_GRAPH_VERSION &&
    !/^v\d{2}\.0$/.test(process.env.FACEBOOK_GRAPH_VERSION)
  )
    throw new Error('FACEBOOK_GRAPH_VERSION debe tener el formato v27.0.');
  return { apiPublica: api.origin, origenesPermitidos, desarrollo };
}
