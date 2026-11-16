// Archivo: src/models/identidad/aplicacion/crear-administrador.use-case.ts
// Crea un administrador desde el flujo autorizado de la herramienta de consola.

import {
  BaseDatos,
  Contrasenas,
  Registro,
} from '../../../core/dominio/comun/contratos';
import { ensure } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';

/** Solo se invoca desde una consola con acceso a la configuración de la base. */
export class CrearAdministradorUseCase {
  constructor(
    private readonly db: BaseDatos,
    private readonly passwords: Contrasenas,
  ) {}
  async execute(input: unknown): Promise<Registro> {
    const body = v.object(input, ['nombre', 'email', 'password']);
    const email = v.email(body.email);
    const name = v.text(body.nombre, 'nombre', 180);
    const hash = await this.passwords.hash(v.password(body.password));
    return this.db.transaction(async (tx) => {
      const count = await tx.store.count('usuario_roles', {
        rolCodigo: 'administrador',
      });
      ensure(
        count === 0,
        'Ya existe un administrador. Asigna nuevos roles mediante la API autorizada.',
        409,
      );
      await tx.store.one('roles', { codigo: 'administrador' }, { lock: true });
      ensure(
        !(await tx.store.count('usuario_roles', {
          rolCodigo: 'administrador',
        })),
        'El administrador ya fue creado.',
        409,
      );
      ensure(
        !(await tx.store.one('usuarios', { email })),
        'El correo ya existe. No se eleva una cuenta existente automáticamente.',
        409,
      );
      const user = await tx.store.insert('usuarios', {
        nombre: name,
        email,
        estado: 'activo',
        emailVerificadoEn: new Date(),
      });
      await tx.store.insert('credenciales_usuario', {
        usuarioId: user.id,
        passwordHash: hash,
      });
      await tx.store.insert('perfiles_usuario', { usuarioId: user.id });
      await tx.store.insert('usuario_roles', {
        usuarioId: user.id,
        rolCodigo: 'usuario',
      });
      await tx.store.insert('usuario_roles', {
        usuarioId: user.id,
        rolCodigo: 'administrador',
      });
      await tx.store.insert('eventos_auditoria', {
        actorId: user.id,
        accion: 'administrador.inicial_creado',
        entidad: 'usuario',
        entidadId: String(user.id),
      });
      return {
        id: user.id,
        mensaje:
          'Administrador inicial creado. No existe una contraseña de fábrica.',
      };
    });
  }
}
