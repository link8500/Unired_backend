// Servidor exclusivo de pruebas: sustituye el proveedor externo y el contador
// de frecuencia HTTP. Conserva guards, contraseñas, roles, PKCE y transacciones.
if (process.env.NODE_ENV !== 'test')
  throw new Error('El proveedor ficticio solo puede ejecutarse en pruebas.');
const { Test } = require('@nestjs/testing');
const { ThrottlerStorage } = require('@nestjs/throttler');
const { AppModule } = require('../../dist/app.module');
const {
  ProveedoresSocialesAdapter,
} = require('../../dist/shared/seguridad/proveedores-sociales.adapter');
const {
  configureApp,
} = require('../../dist/shared/http/configurar-aplicacion');
const profiles = {
  'google-new': {
    sujeto: 'google-new',
    nombre: 'Sofía Social',
    email: 'social@example.test',
    emailVerificado: true,
  },
  'google-admin': {
    sujeto: 'google-admin',
    nombre: 'Admin externo',
    email: 'admin@example.test',
    emailVerificado: true,
  },
  'google-second': {
    sujeto: 'google-second',
    nombre: 'Otra persona',
    email: 'second@example.test',
    emailVerificado: true,
  },
  'facebook-no-email': {
    sujeto: 'facebook-no-email',
    nombre: 'Usuario Facebook',
    email: null,
    emailVerificado: false,
  },
  'facebook-pending': {
    sujeto: 'facebook-pending',
    nombre: 'Usuario Facebook',
    email: 'facebook@example.test',
    emailVerificado: false,
  },
};
const fake = {
  habilitados: () => ({ google: true, facebook: true }),
  autorizacion: (provider, c) => {
    const url = new URL(
      provider === 'google'
        ? 'https://accounts.google.com/o/oauth2/v2/auth'
        : 'https://www.facebook.com/v27.0/dialog/oauth',
    );
    url.searchParams.set('state', c.estado);
    url.searchParams.set('nonce', c.nonce);
    url.searchParams.set('redirect_uri', c.callback);
    return url.toString();
  },
  verificar: async (provider, code) => {
    if (!profiles[code])
      throw new Error('Respuesta externa inválida de prueba.');
    return { proveedor: provider, ...profiles[code] };
  },
};
(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(ProveedoresSocialesAdapter)
    .useValue(fake)
    // La frecuencia no es el objetivo de esta prueba: los límites por intento
    // y los guards de autenticación/roles sí se ejecutan sin sustituciones.
    .overrideProvider(ThrottlerStorage)
    .useValue({
      increment: async () => ({
        totalHits: 1,
        timeToExpire: 60,
        isBlocked: false,
        timeToBlockExpire: 0,
      }),
    })
    .compile();
  const app = module.createNestApplication({ bodyParser: false });
  configureApp(app);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT), '127.0.0.1');
})().catch(() => (process.exitCode = 1));
