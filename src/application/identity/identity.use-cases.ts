import {
  Actor,
  Database,
  Mail,
  Passwords,
  Row,
  Store,
  Tokens,
  Transaction,
} from '../../domain/common/contracts';
import { ensure, missing } from '../../domain/common/errors';
import { Usuarios, TokensCuenta } from '../../domain/common/models';
import * as v from '../../domain/common/validation';
import { BaseUseCases } from '../shared/base.use-cases';
import { preserveAdministrator } from '../shared/admin-safety';

function visible(user: Usuarios) {
  return {
    id: user.id,
    nombre: user.nombre,
    email: user.email,
    edad: user.edad,
    estado: user.estado,
    emailVerificadoEn: user.emailVerificadoEn,
    creadoEn: user.creadoEn,
    actualizadoEn: user.actualizadoEn,
  };
}
/** Cuentas, sesiones revocables y recuperación; no depende de HTTP ni del ORM. */
export class IdentityUseCases extends BaseUseCases {
  private dummy?: Promise<string>;
  constructor(
    db: Database,
    private readonly passwords: Passwords,
    private readonly tokens: Tokens,
    private readonly mail: Mail,
  ) {
    super(db);
  }
  private async user(store: Store, actor: Actor): Promise<Usuarios> {
    const user = await store.one('usuarios', {
      id: actor.id,
      eliminadoEn: null,
    });
    if (!user) missing();
    return user;
  }
  private async sendToken(
    tx: Transaction,
    user: Usuarios,
    purpose: 'verificar_email' | 'recuperar_password',
  ): Promise<void> {
    await tx.store.update(
      'tokens_cuenta',
      { usuarioId: user.id, proposito: purpose, usadoEn: null },
      { usadoEn: new Date() },
    );
    const token = this.tokens.random();
    await tx.store.insert('tokens_cuenta', {
      usuarioId: user.id,
      proposito: purpose,
      tokenHash: this.tokens.digest(token),
      expiraEn: new Date(
        Date.now() + (purpose === 'verificar_email' ? 86400000 : 3600000),
      ),
    });
    await this.mail.enqueue(
      tx.store,
      user.email,
      purpose === 'verificar_email'
        ? 'Verifica tu cuenta UniRed'
        : 'Recupera tu cuenta UniRed',
      'Token de un solo uso para ' +
        purpose +
        ': ' +
        token +
        '\nNo compartas este token. Usa el endpoint de confirmación indicado en la documentación de la API.',
    );
  }
  private async consumeToken(
    tx: Transaction,
    raw: unknown,
    purpose: string,
  ): Promise<TokensCuenta> {
    const token = v.text(raw, 'token', 200, 20);
    const row = await tx.store.one(
      'tokens_cuenta',
      { tokenHash: this.tokens.digest(token), proposito: purpose },
      { lock: true },
    );
    ensure(
      row && !row.usadoEn && new Date(row.expiraEn) > new Date(),
      'Token inválido o vencido.',
      400,
      'INVALID_ACCOUNT_TOKEN',
    );
    await tx.store.update(
      'tokens_cuenta',
      { id: row.id },
      { usadoEn: new Date() },
    );
    return row;
  }
  async register(input: unknown): Promise<Row> {
    const body = v.object(input, ['nombre', 'email', 'password', 'edad']);
    const data = {
      nombre: v.text(body.nombre, 'nombre', 180),
      email: v.email(body.email),
      ...(body.edad === undefined
        ? {}
        : { edad: v.integer(body.edad, 'edad', 0, 130) }),
    };
    const hash = await this.passwords.hash(v.password(body.password));
    const user = await this.db.transaction(async (tx) => {
      const user = await tx.store.insert('usuarios', data);
      await tx.store.insert('credenciales_usuario', {
        usuarioId: user.id,
        passwordHash: hash,
      });
      await tx.store.insert('perfiles_usuario', { usuarioId: user.id });
      await tx.store.insert('usuario_roles', {
        usuarioId: user.id,
        rolCodigo: 'usuario',
      });
      await this.sendToken(tx, user, 'verificar_email');
      await this.audit(tx, undefined, 'cuenta.registrada', 'usuario', user.id);
      return user;
    });
    return {
      usuario: visible(user),
      mensaje:
        'Cuenta creada. Verifica tu correo antes de publicar o inscribirte.',
    };
  }
  async login(input: unknown): Promise<Row> {
    const body = v.object(input, ['email', 'password']);
    const email = v.email(body.email);
    const password = v.secret(body.password, 'password');
    const user = await this.db.read.store.one('usuarios', {
      email,
      eliminadoEn: null,
    });
    const credential =
      user &&
      (await this.db.read.store.one('credenciales_usuario', {
        usuarioId: user.id,
      }));
    this.dummy ??= this.passwords.hash(this.tokens.random());
    const matches = await this.passwords.verify(
      password,
      credential?.passwordHash ?? (await this.dummy),
    );
    ensure(
      user && matches && ['activo', 'pendiente_email'].includes(user.estado),
      'Credenciales inválidas.',
      401,
      'INVALID_CREDENTIALS',
    );
    return this.db.transaction(async (tx) => {
      const locked = await tx.store.one(
        'usuarios',
        { id: user.id },
        { lock: true },
      );
      ensure(
        locked &&
          !locked.eliminadoEn &&
          ['activo', 'pendiente_email'].includes(locked.estado),
        'Cuenta no disponible.',
        401,
      );
      const sid = this.tokens.uuid();
      const refreshToken = sid + '.' + this.tokens.random();
      await tx.store.insert('sesiones_usuario', {
        id: sid,
        usuarioId: user.id,
        refreshTokenHash: this.tokens.digest(refreshToken),
        expiraEn: new Date(Date.now() + 30 * 86400000),
      });
      return {
        accessToken: await this.tokens.access(user.id, sid),
        refreshToken,
        expiresIn: 900,
        usuario: visible(locked),
        roles: (
          await tx.store.find('usuario_roles', { usuarioId: user.id })
        ).map((row) => row.rolCodigo),
      };
    });
  }
  async authenticate(token: string): Promise<Actor> {
    const payload = await this.tokens.verifyAccess(token);
    return this.authenticateClaims(payload);
  }
  async authenticateFile(token: string, fileId: string): Promise<Actor> {
    const payload = await this.tokens.verifyFileAccess(token);
    ensure(
      payload.fileId === v.id(fileId),
      'Este enlace pertenece a otro archivo.',
      401,
    );
    return this.authenticateClaims(payload);
  }
  private async authenticateClaims(payload: {
    sub: number;
    sid: string;
  }): Promise<Actor> {
    const session = await this.db.read.store.one('sesiones_usuario', {
      id: v.uuid(payload.sid),
      usuarioId: payload.sub,
    });
    const user = await this.db.read.store.one('usuarios', {
      id: payload.sub,
      eliminadoEn: null,
    });
    ensure(
      session &&
        !session.revocadaEn &&
        new Date(session.expiraEn) > new Date() &&
        user &&
        ['activo', 'pendiente_email'].includes(user.estado),
      'Sesión inválida o revocada.',
      401,
      'INVALID_SESSION',
    );
    return {
      id: user.id,
      estado: user.estado,
      sessionId: session.id,
      roles: (
        await this.db.read.store.find('usuario_roles', { usuarioId: user.id })
      ).map((row) => row.rolCodigo),
    };
  }
  async refresh(input: unknown): Promise<Row> {
    const body = v.object(input, ['refreshToken']);
    const raw = v.text(body.refreshToken, 'refreshToken', 200, 60);
    const sid = v.uuid(raw.split('.')[0]);
    const result = await this.db.transaction(async (tx) => {
      const session = await tx.store.one(
        'sesiones_usuario',
        { id: sid },
        { lock: true },
      );
      if (
        !session ||
        session.revocadaEn ||
        new Date(session.expiraEn) <= new Date()
      )
        return null;
      const user = await tx.store.one('usuarios', {
        id: session.usuarioId,
        eliminadoEn: null,
      });
      if (!user || !['activo', 'pendiente_email'].includes(user.estado))
        return null;
      if (
        !Buffer.from(session.refreshTokenHash).equals(this.tokens.digest(raw))
      ) {
        // Se confirma la revocación ANTES de responder error; no se revierte el rechazo.
        await tx.store.update(
          'sesiones_usuario',
          { id: sid },
          { revocadaEn: new Date() },
        );
        return null;
      }
      const refreshToken = sid + '.' + this.tokens.random();
      await tx.store.update(
        'sesiones_usuario',
        { id: sid },
        { refreshTokenHash: this.tokens.digest(refreshToken) },
      );
      return {
        accessToken: await this.tokens.access(user.id, sid),
        refreshToken,
        expiresIn: 900,
      };
    });
    ensure(
      result,
      'Refresh token inválido, reutilizado o vencido.',
      401,
      'INVALID_REFRESH',
    );
    return result;
  }
  async logout(actor: Actor, all = false): Promise<Row> {
    await this.db.read.store.update(
      'sesiones_usuario',
      all
        ? { usuarioId: actor.id, revocadaEn: null }
        : { id: actor.sessionId, usuarioId: actor.id },
      { revocadaEn: new Date() },
    );
    return { mensaje: 'Sesión cerrada.' };
  }
  async verifyEmail(input: unknown): Promise<Row> {
    const body = v.object(input, ['token']);
    return this.db.transaction(async (tx) => {
      const token = await this.consumeToken(tx, body.token, 'verificar_email');
      const user = await tx.store.one(
        'usuarios',
        { id: token.usuarioId },
        { lock: true },
      );
      ensure(
        user && !user.eliminadoEn && user.estado === 'pendiente_email',
        'Cuenta no disponible.',
      );
      await tx.store.update(
        'usuarios',
        { id: user.id },
        { estado: 'activo', emailVerificadoEn: new Date() },
      );
      await this.audit(
        tx,
        undefined,
        'cuenta.email_verificado',
        'usuario',
        user.id,
      );
      return { mensaje: 'Correo verificado. Ya puedes utilizar la cuenta.' };
    });
  }
  async resendVerification(actor: Actor): Promise<Row> {
    return this.db.transaction(async (tx) => {
      const user = await this.user(tx.store, actor);
      ensure(user.estado === 'pendiente_email', 'El correo ya fue verificado.');
      await this.sendToken(tx, user, 'verificar_email');
      return { mensaje: 'Correo de verificación encolado.' };
    });
  }
  async forgot(input: unknown): Promise<Row> {
    const body = v.object(input, ['email']);
    const email = v.email(body.email);
    await this.db.transaction(async (tx) => {
      const user = await tx.store.one(
        'usuarios',
        { email, eliminadoEn: null },
        { lock: true },
      );
      if (user && ['activo', 'pendiente_email'].includes(user.estado))
        await this.sendToken(tx, user, 'recuperar_password');
    });
    return {
      mensaje:
        'Si la cuenta existe, recibirás las instrucciones de recuperación.',
    };
  }
  async resetPassword(input: unknown): Promise<Row> {
    const body = v.object(input, ['token', 'password']);
    const hash = await this.passwords.hash(v.password(body.password));
    return this.db.transaction(async (tx) => {
      const token = await this.consumeToken(
        tx,
        body.token,
        'recuperar_password',
      );
      const user = await tx.store.one(
        'usuarios',
        { id: token.usuarioId },
        { lock: true },
      );
      ensure(
        user &&
          !user.eliminadoEn &&
          ['activo', 'pendiente_email'].includes(user.estado),
        'Cuenta no disponible.',
      );
      const old = await tx.store.one('credenciales_usuario', {
        usuarioId: user.id,
      });
      if (old)
        await tx.store.update(
          'credenciales_usuario',
          { usuarioId: user.id },
          { passwordHash: hash, cambiadaEn: new Date() },
        );
      else
        await tx.store.insert('credenciales_usuario', {
          usuarioId: user.id,
          passwordHash: hash,
        });
      await tx.store.update(
        'sesiones_usuario',
        { usuarioId: user.id, revocadaEn: null },
        { revocadaEn: new Date() },
      );
      await this.audit(
        tx,
        undefined,
        'cuenta.password_recuperada',
        'usuario',
        user.id,
      );
      return { mensaje: 'Contraseña actualizada. Inicia sesión nuevamente.' };
    });
  }
  async changePassword(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, ['passwordActual', 'passwordNueva']);
    const current = v.secret(body.passwordActual, 'passwordActual');
    const hash = await this.passwords.hash(v.password(body.passwordNueva));
    return this.db.transaction(async (tx) => {
      const credential = await tx.store.one(
        'credenciales_usuario',
        { usuarioId: actor.id },
        { lock: true },
      );
      ensure(
        credential &&
          (await this.passwords.verify(current, credential.passwordHash)),
        'Contraseña actual incorrecta.',
        403,
      );
      await tx.store.update(
        'credenciales_usuario',
        { usuarioId: actor.id },
        { passwordHash: hash, cambiadaEn: new Date() },
      );
      await tx.store.update(
        'sesiones_usuario',
        { usuarioId: actor.id, revocadaEn: null },
        { revocadaEn: new Date() },
      );
      await this.audit(
        tx,
        actor,
        'cuenta.password_cambiada',
        'usuario',
        actor.id,
      );
      return {
        mensaje: 'Contraseña cambiada; todas las sesiones fueron cerradas.',
      };
    });
  }
  async me(actor: Actor): Promise<Row> {
    const user = await this.user(this.db.read.store, actor);
    return {
      ...visible(user),
      roles: actor.roles,
      perfil: await this.db.read.store.one('perfiles_usuario', {
        usuarioId: actor.id,
      }),
    };
  }
  async changeEmail(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, ['email', 'passwordActual']);
    const email = v.email(body.email);
    const password = v.secret(body.passwordActual, 'passwordActual');
    return this.db.transaction(async (tx) => {
      const user = await tx.store.one(
        'usuarios',
        { id: actor.id },
        { lock: true },
      );
      ensure(
        user && !user.eliminadoEn && user.email !== email,
        'Selecciona un correo diferente.',
      );
      const credential = await tx.store.one('credenciales_usuario', {
        usuarioId: actor.id,
      });
      ensure(
        credential &&
          (await this.passwords.verify(password, credential.passwordHash)),
        'Contraseña actual incorrecta.',
        403,
      );
      const oldEmail = user.email;
      const [updated] = await tx.store.update(
        'usuarios',
        { id: actor.id },
        { email, estado: 'pendiente_email', emailVerificadoEn: null },
      );
      await tx.store.update(
        'tokens_cuenta',
        { usuarioId: actor.id, usadoEn: null },
        { usadoEn: new Date() },
      );
      await tx.store.update(
        'sesiones_usuario',
        { usuarioId: actor.id, revocadaEn: null },
        { revocadaEn: new Date() },
      );
      await this.sendToken(tx, updated, 'verificar_email');
      await this.mail.enqueue(
        tx.store,
        oldEmail,
        'Cambio de correo de tu cuenta UniRed',
        'El correo de tu cuenta fue cambiado. Si no reconoces esta acción, contacta al soporte.',
      );
      await this.audit(tx, actor, 'cuenta.email_cambiado', 'usuario', actor.id);
      return {
        mensaje:
          'Correo cambiado. Verifica la nueva dirección e inicia sesión nuevamente.',
      };
    });
  }
  async sessions(actor: Actor): Promise<Row[]> {
    return this.db.read.store.find(
      'sesiones_usuario',
      { usuarioId: actor.id, revocadaEn: null },
      {
        fields: ['id', 'creadoEn', 'expiraEn'],
        order: { creadoEn: 'DESC' },
        limit: 100,
      },
    );
  }
  async revokeSession(actor: Actor, sid: unknown): Promise<Row> {
    const session = await this.db.read.store.one('sesiones_usuario', {
      id: v.uuid(sid),
      usuarioId: actor.id,
    });
    if (!session) missing();
    await this.db.read.store.update(
      'sesiones_usuario',
      { id: session.id },
      { revocadaEn: new Date() },
    );
    return { mensaje: 'Sesión revocada.' };
  }
  async editProfile(actor: Actor, input: unknown): Promise<Row> {
    const body = v.object(input, [
      'nombre',
      'edad',
      'presentacion',
      'telefono',
      'telefonoPublico',
      'areaProfesional',
      'ciudad',
      'notificacionesActivas',
    ]);
    const fields = v.pickDefined(body, {
      nombre: (x) => v.text(x, 'nombre', 180),
      edad: (x) => v.integer(x, 'edad', 0, 130),
      presentacion: (x) =>
        x === null ? null : v.text(x, 'presentacion', 5000, 0),
      telefono: (x) => (x === null ? null : v.text(x, 'telefono', 30, 0)),
      telefonoPublico: (x) => v.boolean(x, 'telefonoPublico'),
      areaProfesional: (x) =>
        x === null ? null : v.text(x, 'areaProfesional', 160, 0),
      ciudad: (x) => (x === null ? null : v.text(x, 'ciudad', 120, 0)),
      notificacionesActivas: (x) => v.boolean(x, 'notificacionesActivas'),
    });
    await this.db.transaction(async (tx) => {
      const account: Row = {};
      const profile: Row = {};
      for (const [key, value] of Object.entries(fields))
        (['nombre', 'edad'].includes(key) ? account : profile)[key] = value;
      if (Object.keys(account).length)
        await tx.store.update('usuarios', { id: actor.id }, account);
      if (Object.keys(profile).length)
        await tx.store.update(
          'perfiles_usuario',
          { usuarioId: actor.id },
          profile,
        );
      await this.audit(tx, actor, 'perfil.actualizado', 'usuario', actor.id);
    });
    return this.me(actor);
  }
  async deactivate(actor: Actor): Promise<Row> {
    await this.db.transaction(async (tx) => {
      await preserveAdministrator(tx, actor.id);
      await tx.store.update(
        'usuarios',
        { id: actor.id },
        { estado: 'desactivado', eliminadoEn: new Date() },
      );
      await tx.store.update(
        'sesiones_usuario',
        { usuarioId: actor.id, revocadaEn: null },
        { revocadaEn: new Date() },
      );
      await this.audit(tx, actor, 'cuenta.desactivada', 'usuario', actor.id);
    });
    return { mensaje: 'Cuenta desactivada; historial conservado.' };
  }
}
