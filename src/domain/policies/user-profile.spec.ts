import {
  employmentChanges,
  parseProfile,
  profileDefinition,
  splitProfileFields,
} from './user-profile';

describe('Perfil universitario y excepción del administrador', () => {
  it('separa los campos según el rol y el administrador prevalece', () => {
    expect(profileDefinition(['usuario']).tipoPerfil).toBe('universitario');
    const admin = profileDefinition(['usuario', 'administrador']);
    expect(admin.tipoPerfil).toBe('administrador');
    expect(admin.camposPerfilEditables).toContain('trabaja');
    expect(admin.camposPerfilEditables).not.toContain('universidad');
    expect(admin.camposPerfilEditables).not.toContain('edad');
  });
  it('valida y normaliza los datos de un universitario', () => {
    const fields = parseProfile(
      {
        nombre: ' Ana ',
        edad: 21,
        pais: ' Nicaragua ',
        departamento: 'Managua',
        ciudad: 'Managua',
        universidad: 'UNAN-Managua',
        sede: 'Central',
        carrera: 'Sistemas',
        anioEstudio: 3,
        trabaja: true,
        ocupacion: ' Desarrolladora ',
        telefono: '+505 8888-8888',
      },
      ['usuario'],
    );
    expect(fields.nombre).toBe('Ana');
    expect(fields.pais).toBe('Nicaragua');
    expect(fields.ocupacion).toBe('Desarrolladora');
    expect(fields.anioEstudio).toBe(3);
  });
  it('valida el perfil básico del administrador sin datos académicos', () => {
    expect(
      parseProfile({ ciudad: 'León', trabaja: false, telefono: '88888888' }, [
        'usuario',
        'administrador',
      ]),
    ).toEqual({
      ciudad: 'León',
      trabaja: false,
      telefono: '88888888',
    });
  });
  it.each(['edad', 'universidad', 'sede', 'carrera', 'anioEstudio'])(
    'rechaza %s en el perfil administrativo incluso cuando es null',
    (field) =>
      expect(() =>
        parseProfile({ [field]: null }, ['administrador']),
      ).toThrow(),
  );
  it.each(['roles', 'estado', 'usuarioId', 'tipoPerfil', 'email', 'password'])(
    'no permite modificar %s mediante el perfil',
    (field) =>
      expect(() => parseProfile({ [field]: 'valor' }, ['usuario'])).toThrow(),
  );
  it.each([
    { trabaja: 'false' },
    { trabaja: 0 },
    { edad: 131 },
    { edad: '21' },
    { anioEstudio: 0 },
    { anioEstudio: 16 },
    { anioEstudio: 1.5 },
    { universidad: 'x'.repeat(181) },
    { pais: 'x'.repeat(81) },
    { telefono: 'abcdefg' },
    { telefono: '123' },
    { telefono: '1'.repeat(16) },
  ])('rechaza tipos, longitudes o rangos inválidos: %j', (input) => {
    expect(() => parseProfile(input, ['usuario'])).toThrow();
  });
  it('un PATCH omitido conserva datos; null y texto vacío los borran', () => {
    expect(
      parseProfile(
        { ciudad: '  ', universidad: null, edad: null, trabaja: null },
        ['usuario'],
      ),
    ).toEqual({ ciudad: null, universidad: null, edad: null, trabaja: null });
    expect(parseProfile({ ciudad: 'Managua' }, ['usuario'])).not.toHaveProperty(
      'trabaja',
    );
    expect(() => parseProfile({}, ['usuario'])).toThrow();
  });
  it('no acepta una ocupación si no se indicó que trabaja', () => {
    expect(() => employmentChanges({ ocupacion: 'Docente' })).toThrow();
    expect(() =>
      employmentChanges({ trabaja: false, ocupacion: 'Docente' }),
    ).toThrow();
    expect(() =>
      employmentChanges({ ocupacion: 'Docente' }, { trabaja: null }),
    ).toThrow();
  });
  it('puede editar solo la ocupación cuando ya trabaja', () => {
    expect(
      employmentChanges({ ocupacion: 'Docente' }, { trabaja: true }),
    ).toEqual({ ocupacion: 'Docente' });
  });
  it.each([false, null])(
    'limpia la ocupación al cambiar trabaja a %s',
    (trabaja) => {
      expect(
        employmentChanges({ trabaja }, { trabaja: true, ocupacion: 'Docente' }),
      ).toEqual({ trabaja, ocupacion: null });
    },
  );
  it('separa la cuenta del perfil sin copiar roles o credenciales', () => {
    expect(
      splitProfileFields({
        nombre: 'Ana',
        edad: 21,
        universidad: 'UNAN',
        trabaja: false,
      }),
    ).toEqual({
      account: { nombre: 'Ana', edad: 21 },
      profile: { universidad: 'UNAN', trabaja: false },
    });
  });
});
