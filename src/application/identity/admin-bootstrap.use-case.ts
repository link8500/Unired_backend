import { Database, Passwords, Row } from '../../domain/common/contracts';
import { ensure } from '../../domain/common/errors';
import * as v from '../../domain/common/validation';

/** Solo se invoca desde una consola con acceso a la configuración de la base. */
export class AdminBootstrapUseCase {
  constructor(
    private readonly db: Database,
    private readonly passwords: Passwords,
  ) {}
  async execute(input: unknown): Promise<Row> {
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
