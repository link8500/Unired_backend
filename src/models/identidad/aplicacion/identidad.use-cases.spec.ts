// Archivo: src/models/identidad/aplicacion/identidad.use-cases.spec.ts
// Pruebas automatizadas del componente identidad.use-cases y sus condiciones de error.

import { IdentidadUseCases } from './identidad.use-cases';
import {
  BaseDatos,
  Correo,
  Contrasenas,
  Tokens,
  Registro,
} from '../../../core/dominio/comun/contratos';

function setup(required = true, state = 'pendiente_email') {
  const user: Registro = {
    id: 1,
    nombre: 'Usuario de prueba',
    email: 'usuario@example.test',
    estado: state,
    eliminadoEn: null,
    emailVerificadoEn: null,
  };
  const session = {
    id: '1c2511ff-911b-4acb-9046-7dd3b11034a5',
    usuarioId: 1,
    revocadaEn: null,
    expiraEn: new Date(Date.now() + 86400000),
  };
  const inserted: { entity: string; values: Registro }[] = [];
  const store = {
    one: jest.fn((entity: string) =>
      Promise.resolve(
        entity === 'usuarios'
          ? user
          : entity === 'sesiones_usuario'
            ? session
            : entity === 'credenciales_usuario'
              ? { passwordHash: 'hash' }
              : entity === 'tokens_cuenta'
                ? {
                    id: '1',
                    usuarioId: 1,
                    usadoEn: null,
                    expiraEn: new Date(Date.now() + 86400000),
                  }
                : undefined,
      ),
    ),
    find: jest.fn(() => Promise.resolve([{ rolCodigo: 'usuario' }])),
    insert: jest.fn((entity: string, values: Registro) => {
      inserted.push({ entity, values });
      if (entity === 'usuarios') Object.assign(user, values);
      return Promise.resolve(
        entity === 'usuarios' ? user : { id: '1', ...values },
      );
    }),
    update: jest.fn((entity: string, _where: Registro, values: Registro) => {
      if (entity === 'usuarios') Object.assign(user, values);
      return Promise.resolve([
        entity === 'usuarios' ? user : { id: '1', ...values },
      ]);
    }),
  };
  const db = {
    read: { store },
    transaction: async (work: (tx: unknown) => unknown) => work({ store }),
  } as unknown as BaseDatos;
  const passwords = {
    hash: jest.fn(async () => 'hash'),
    verify: jest.fn(async () => true),
  } as Contrasenas;
  const tokens = {
    random: () => 'token-de-prueba-1234567890',
    digest: () => Buffer.from('hash'),
    uuid: () => session.id,
    access: jest.fn(async () => 'jwt-de-prueba'),
    verifyAccess: jest.fn(async () => ({ sub: 1, sid: session.id })),
  } as unknown as Tokens;
  const mail = { enqueue: jest.fn(async () => {}) } as Correo;
  return {
    user,
    inserted,
    mail,
    identity: new IdentidadUseCases(db, passwords, tokens, mail, required),
  };
}
describe('Verificación de correo reversible', () => {
  it('conserva el registro pendiente y el envío del token cuando está activada', async () => {
    const test = setup();
    const result = await test.identity.register({
      nombre: 'Usuario',
      email: 'usuario@example.test',
      password: 'Una-password-segura-2026!',
    });
    expect(result.verificacionEmailRequerida).toBe(true);
    expect(test.user.estado).toBe('pendiente_email');
    expect(test.mail.enqueue).toHaveBeenCalledTimes(1);
  });
  it('registra sin token cuando está desactivada, sin inventar un correo verificado', async () => {
    const test = setup(false);
    const result = await test.identity.register({
      nombre: 'Usuario',
      email: 'usuario@example.test',
      password: 'Una-password-segura-2026!',
    });
    expect(result.verificacionEmailRequerida).toBe(false);
    expect(test.user.estado).toBe('activo');
    expect(test.user.emailVerificadoEn).toBeNull();
    expect(test.mail.enqueue).not.toHaveBeenCalled();
    expect(test.inserted.some((row) => row.entity === 'tokens_cuenta')).toBe(
      false,
    );
  });
  it('permite entrar a una cuenta anterior pendiente solo en el modo sin verificación', async () => {
    const test = setup(false);
    await test.identity.login({
      email: 'usuario@example.test',
      password: 'Una-password-segura-2026!',
    });
    expect(test.user.estado).toBe('activo');
    expect(test.user.emailVerificadoEn).toBeNull();
    expect(
      test.inserted.some(
        (row) =>
          row.entity === 'eventos_auditoria' &&
          row.values.accion === 'cuenta.verificacion_omitida_desarrollo',
      ),
    ).toBe(true);
  });
  it('no permite entrar a cuentas suspendidas aunque la verificación esté apagada', async () => {
    const test = setup(false, 'suspendido');
    await expect(
      test.identity.login({
        email: 'usuario@example.test',
        password: 'Una-password-segura-2026!',
      }),
    ).rejects.toThrow();
    expect(test.user.estado).toBe('suspendido');
  });
  it('volver a activarla bloquea el acceso protegido si el correo nunca se verificó', async () => {
    const test = setup(true, 'activo');
    const actor = await test.identity.authenticate('jwt-de-prueba');
    expect(actor.estado).toBe('pendiente_email');
    const account = await test.identity.me(actor);
    expect(account.estado).toBe('pendiente_email');
    expect(account.verificacionEmailRequerida).toBe(true);
    expect(test.user.estado).toBe('activo');
  });
  it('conserva la confirmación de tokens existentes al reactivar la política', async () => {
    const test = setup(true, 'activo');
    await test.identity.verifyEmail({ token: 'token-de-prueba-1234567890' });
    expect(test.user.estado).toBe('activo');
    expect(test.user.emailVerificadoEn).toBeInstanceOf(Date);
  });
  it('desactivarla no permite que el registro asigne privilegios', async () => {
    const test = setup(false);
    await expect(
      test.identity.register({
        nombre: 'Usuario',
        email: 'usuario@example.test',
        password: 'Una-password-segura-2026!',
        roles: ['administrador'],
      }),
    ).rejects.toThrow();
  });
});
