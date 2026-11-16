// Archivo: src/core/dominio/politicas/perfil-usuario.ts
// Define los campos personales y académicos permitidos según los roles de la cuenta.

import { Registro } from '../comun/contratos';
import { ensure } from '../comun/errores';
import * as v from '../comun/validaciones';

/** Datos comunes; no contienen roles, estados de cuenta ni credenciales. */
export const basicProfileFields = [
  'nombre',
  'presentacion',
  'telefono',
  'telefonoPublico',
  'areaProfesional',
  'pais',
  'departamento',
  'ciudad',
  'trabaja',
  'ocupacion',
  'notificacionesActivas',
] as const;

/** Solo el perfil universitario admite información académica y edad. */
export const academicProfileFields = [
  'edad',
  'universidad',
  'sede',
  'carrera',
  'anioEstudio',
] as const;
export const universityProfileFields = [
  ...basicProfileFields,
  ...academicProfileFields,
];

/** Administrador prevalece aunque la cuenta también tenga el rol usuario. */
export function profileDefinition(roles: readonly string[]) {
  const administrator = roles.includes('administrador');
  return {
    tipoPerfil: administrator ? 'administrador' : 'universitario',
    camposPerfilEditables: administrator
      ? [...basicProfileFields]
      : [...universityProfileFields],
  };
}

/** null o texto vacío borra un dato opcional; omitirlo lo conserva en un PATCH. */
function optionalText(
  value: unknown,
  name: string,
  max: number,
): string | null {
  if (value === null) return null;
  return v.text(value, name, max, 0) || null;
}
function phone(value: unknown): string | null {
  const result = optionalText(value, 'telefono', 30);
  if (result !== null) {
    ensure(
      /^[+\d\s().-]+$/.test(result) &&
        /^\d{7,15}$/.test(result.replace(/\D/g, '')),
      'telefono debe contener entre 7 y 15 dígitos; puede incluir prefijo y separadores.',
    );
  }
  return result;
}

/** Validación independiente de HTTP/ORM, compartida por registro y edición. */
export function parseProfile(
  input: unknown,
  roles: readonly string[],
  extraAllowed: readonly string[] = [],
): Registro {
  const allowed = profileDefinition(roles).camposPerfilEditables;
  const body = v.object(input, [...allowed, ...extraAllowed]);
  const parsers: Record<string, (value: unknown) => unknown> = {
    nombre: (x) => v.text(x, 'nombre', 180),
    edad: (x) => (x === null ? null : v.integer(x, 'edad', 0, 130)),
    presentacion: (x) => optionalText(x, 'presentacion', 5000),
    telefono: phone,
    telefonoPublico: (x) => v.boolean(x, 'telefonoPublico'),
    // Compatibilidad: área profesional sigue siendo opcional; no equivale a carrera.
    areaProfesional: (x) => optionalText(x, 'areaProfesional', 160),
    pais: (x) => optionalText(x, 'pais', 80),
    departamento: (x) => optionalText(x, 'departamento', 120),
    ciudad: (x) => optionalText(x, 'ciudad', 120),
    universidad: (x) => optionalText(x, 'universidad', 180),
    sede: (x) => optionalText(x, 'sede', 180),
    carrera: (x) => optionalText(x, 'carrera', 180),
    anioEstudio: (x) =>
      x === null ? null : v.integer(x, 'anioEstudio', 1, 15),
    trabaja: (x) => (x === null ? null : v.boolean(x, 'trabaja')),
    ocupacion: (x) => optionalText(x, 'ocupacion', 160),
    notificacionesActivas: (x) => v.boolean(x, 'notificacionesActivas'),
  };
  return v.pickDefined(
    body,
    Object.fromEntries(allowed.map((key) => [key, parsers[key]])),
  );
}

/** No se inventa que una cuenta trabaja: null = no indicado, false = no, true = sí. */
export function employmentChanges(
  fields: Registro,
  current: Registro = {},
): Registro {
  const result = { ...fields };
  const works = fields.trabaja === undefined ? current.trabaja : fields.trabaja;
  if (fields.ocupacion !== undefined && fields.ocupacion !== null) {
    ensure(
      works === true,
      'Indica trabaja=true antes de guardar una ocupación.',
    );
  }
  if (fields.trabaja !== undefined && works !== true) result.ocupacion = null;
  return result;
}

/** La edad permanece en usuarios; los demás datos personales van al perfil. */
export function splitProfileFields(fields: Registro): {
  account: Registro;
  profile: Registro;
} {
  const account: Registro = {};
  const profile: Registro = {};
  for (const [key, value] of Object.entries(fields)) {
    (['nombre', 'edad'].includes(key) ? account : profile)[key] = value;
  }
  return { account, profile };
}
