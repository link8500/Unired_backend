import { IdentityUseCases } from './identity.use-cases';
import {
  Actor,
  Database,
  Mail,
  Passwords,
  Row,
  Tokens,
} from '../../domain/common/contracts';

function fixture(roles = ['usuario']) {
  const user: Row = {
    id: 1,
    nombre: 'Ana',
    email: 'ana@example.test',
    edad: null,
    estado: 'activo',
    emailVerificadoEn: new Date(),
    eliminadoEn: null,
  };
  const profile: Row = {
    usuarioId: 1,
    ciudad: 'Managua',
    trabaja: true,
    ocupacion: 'Docente',
  };
  const store = {
    one: jest.fn((table: string) =>
      Promise.resolve(table === 'usuarios' ? user : profile),
    ),
    find: jest.fn(() =>
      Promise.resolve(roles.map((rolCodigo) => ({ rolCodigo }))),
    ),
    insert: jest.fn((_table: string, values: Row) => Promise.resolve(values)),
    update: jest.fn((table: string, _where: Row, values: Row) => {
      Object.assign(table === 'usuarios' ? user : profile, values);
      return Promise.resolve([table === 'usuarios' ? user : profile]);
    }),
  };
  const db = {
    read: { store },
    transaction: (work: (tx: unknown) => unknown) =>
      Promise.resolve(work({ store })),
  } as unknown as Database;
  const identity = new IdentityUseCases(
    db,
    {} as Passwords,
    {} as Tokens,
    {} as Mail,
    false,
  );
  const actor: Actor = { id: 1, roles, estado: 'activo', sessionId: 'sesion' };
  return { identity, store, user, profile, actor };
}

describe('Persistencia del perfil por rol', () => {
  it('permite retirar solo una imagen y rechaza un PATCH vacío', async () => {
    const test = fixture();
    await test.identity.editProfile(test.actor, { avatarArchivoId: null });
    expect(test.profile.avatarArchivoId).toBeNull();
    await expect(test.identity.editProfile(test.actor, {})).rejects.toThrow('No hay campos editables.');
  });
  it('confirma las imágenes propias y el texto en la misma actualización', async () => {
    const test = fixture();
    const previous = test.store.one.getMockImplementation()!;
    test.store.one.mockImplementation((table: string) =>
      table === 'archivos'
        ? Promise.resolve({
            id: '90',
            propietarioId: 1,
            proposito: 'avatar',
            estado: 'listo',
            escaneo: 'limpio',
          })
        : previous(table),
    );
    await test.identity.editProfile(test.actor, {
      nombre: 'Ana López',
      avatarArchivoId: '90',
    });
    expect(test.user.nombre).toBe('Ana López');
    expect(test.profile.avatarArchivoId).toBe('90');
  });
  it('rechaza una imagen ajena antes de cambiar el nombre o el perfil', async () => {
    const test = fixture();
    const previous = test.store.one.getMockImplementation()!;
    test.store.one.mockImplementation((table: string) =>
      table === 'archivos'
        ? Promise.resolve({
            id: '90',
            propietarioId: 2,
            proposito: 'avatar',
            estado: 'listo',
            escaneo: 'limpio',
          })
        : previous(table),
    );
    await expect(
      test.identity.editProfile(test.actor, {
        nombre: 'Otro',
        avatarArchivoId: '90',
      }),
    ).rejects.toThrow();
    expect(test.store.update).not.toHaveBeenCalled();
    expect(test.user.nombre).toBe('Ana');
  });
  it('valida todas las imágenes antes de escribir cualquier cambio', async () => {
    const test = fixture();
    const previous = test.store.one.getMockImplementation()!;
    test.store.one.mockImplementation((table: string) =>
      table === 'archivos'
        ? Promise.resolve({
            id: '90',
            propietarioId: 1,
            proposito: 'avatar',
            estado: 'listo',
            escaneo: 'limpio',
          })
        : previous(table),
    );
    await expect(
      test.identity.editProfile(test.actor, {
        nombre: 'Otro',
        avatarArchivoId: '90',
        bannerArchivoId: '90',
      }),
    ).rejects.toThrow();
    expect(test.store.update).not.toHaveBeenCalled();
  });
  it('guarda edad en la cuenta y estudios en el perfil dentro de una transacción', async () => {
    const test = fixture();
    const result = await test.identity.editProfile(test.actor, {
      edad: 22,
      universidad: 'UNAN',
      carrera: 'Sistemas',
      anioEstudio: 3,
    });
    expect(test.user.edad).toBe(22);
    expect(test.profile.universidad).toBe('UNAN');
    expect(test.store.update).toHaveBeenCalledWith(
      'usuarios',
      { id: 1 },
      { edad: 22 },
    );
    expect(result.tipoPerfil).toBe('universitario');
    expect(result.camposPerfilEditables).toContain('universidad');
  });
  it('el administrador actualiza residencia, teléfono y empleo', async () => {
    const test = fixture(['usuario', 'administrador']);
    const result = await test.identity.editProfile(test.actor, {
      ciudad: 'León',
      telefono: '+505 8888-8888',
      trabaja: false,
    });
    expect(test.profile.ciudad).toBe('León');
    expect(test.profile.trabaja).toBe(false);
    expect(test.profile.ocupacion).toBeNull();
    expect(result.tipoPerfil).toBe('administrador');
    expect(result.camposPerfilEditables).not.toContain('edad');
  });
  it('usa el rol almacenado aunque el actor recibido estuviera desactualizado', async () => {
    const test = fixture(['usuario', 'administrador']);
    await expect(
      test.identity.editProfile(
        { ...test.actor, roles: ['usuario'] },
        { universidad: 'UNAN' },
      ),
    ).rejects.toThrow();
    expect(test.store.update).not.toHaveBeenCalled();
  });
  it('bloquea la cuenta antes de consultar roles para evitar cambios simultáneos', async () => {
    const test = fixture();
    await test.identity.editProfile(test.actor, { telefonoPublico: false });
    expect(test.store.one).toHaveBeenCalledWith(
      'usuarios',
      { id: 1, eliminadoEn: null },
      { lock: true },
    );
    expect(test.store.one.mock.invocationCallOrder[0]).toBeLessThan(
      test.store.find.mock.invocationCallOrder[0],
    );
  });
  it('devuelve el tipo administrativo actual aunque el actor estuviera desactualizado', async () => {
    const test = fixture(['usuario', 'administrador']);
    const result = await test.identity.editProfile(
      { ...test.actor, roles: ['usuario'] },
      { ciudad: 'León' },
    );
    expect(result.tipoPerfil).toBe('administrador');
    expect(result.roles).toContain('administrador');
    expect(result.camposPerfilEditables).not.toContain('universidad');
  });
  it('un PATCH parcial no borra el resto del perfil', async () => {
    const test = fixture();
    await test.identity.editProfile(test.actor, { universidad: null });
    expect(test.profile.ciudad).toBe('Managua');
    expect(test.profile.ocupacion).toBe('Docente');
    expect(test.profile.universidad).toBeNull();
  });
  it('no hace escrituras cuando la situación laboral es incoherente', async () => {
    const test = fixture();
    await expect(
      test.identity.editProfile(test.actor, {
        nombre: 'Otro',
        trabaja: false,
        ocupacion: 'Docente',
      }),
    ).rejects.toThrow();
    expect(test.store.update).not.toHaveBeenCalled();
    expect(test.user.nombre).toBe('Ana');
  });
});
