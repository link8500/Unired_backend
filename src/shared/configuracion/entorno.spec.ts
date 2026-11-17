// Archivo: src/shared/configuracion/entorno.spec.ts
// Pruebas automatizadas del componente entorno y sus condiciones de error.

import { emailVerificationRequired, frontendOrigin } from './entorno';

describe('Origen del frontend para enlaces de cuenta', () => {
  const original = {
    FRONTEND_URL: process.env.FRONTEND_URL,
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    NODE_ENV: process.env.NODE_ENV,
  };
  beforeEach(() => {
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGINS;
    process.env.NODE_ENV = 'test';
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('reutiliza el origen público ya configurado para Netlify', () => {
    process.env.CORS_ORIGINS =
      'https://unired-link8500.netlify.app,https://otro.example';
    expect(frontendOrigin()).toBe('https://unired-link8500.netlify.app');
  });
  it('permite indicar el frontend local y evita enlaces con credenciales o protocolos ajenos', () => {
    process.env.FRONTEND_URL = 'http://localhost:62604/';
    expect(frontendOrigin()).toBe('http://localhost:62604');
    for (const url of [
      'javascript:alert(1)',
      'https://usuario:clave@example.com',
      'https://example.com/otra-ruta',
      'https://example.com/?token=1',
    ]) {
      process.env.FRONTEND_URL = url;
      expect(() => frontendOrigin()).toThrow();
    }
  });
});
describe('Interruptor de verificación de correo', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalFlag = process.env.REQUIRE_EMAIL_VERIFICATION;
  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnv;
    if (originalFlag === undefined)
      delete process.env.REQUIRE_EMAIL_VERIFICATION;
    else process.env.REQUIRE_EMAIL_VERIFICATION = originalFlag;
  });
  it('exige verificar por defecto', () => {
    delete process.env.REQUIRE_EMAIL_VERIFICATION;
    expect(emailVerificationRequired()).toBe(true);
  });
  it.each(['development', 'test'])(
    'permite omitirlo solo en %s',
    (environment) => {
      process.env.NODE_ENV = environment;
      process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
      expect(emailVerificationRequired()).toBe(false);
    },
  );
  it('rechaza desactivarlo en producción', () => {
    process.env.NODE_ENV = 'production';
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    expect(() => emailVerificationRequired()).toThrow();
  });
  it('rechaza desactivarlo en un entorno no identificado', () => {
    delete process.env.NODE_ENV;
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    expect(() => emailVerificationRequired()).toThrow();
  });
  it('rechaza valores que podrían interpretarse ambiguamente', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'FALSE';
    expect(() => emailVerificationRequired()).toThrow();
  });
});
