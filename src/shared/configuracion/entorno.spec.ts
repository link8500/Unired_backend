// Archivo: src/shared/configuracion/entorno.spec.ts
// Pruebas automatizadas del componente entorno y sus condiciones de error.

import { emailVerificationRequired } from './entorno';
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
