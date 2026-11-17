// Archivo: src/models/identidad/aplicacion/identidad.use-cases.ts
// Registra cuentas, valida el acceso y coordina sesiones, verificación de correo, recuperación y edición del perfil.

import {
  Actor,
  BaseDatos,
  Correo,
  Contrasenas,
  Registro,
  AlmacenDatos,
  Tokens,
  Transaccion,
} from '../../../core/dominio/comun/contratos';
import { ensure, missing } from '../../../core/dominio/comun/errores';
import { Usuarios, TokensCuenta } from '../../../core/dominio/comun/entidades';
import * as v from '../../../core/dominio/comun/validaciones';
import { IdentidadSocial } from '../../../core/dominio/comun/acceso-social';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';
import { preserveAdministrator } from '../../../core/aplicacion/seguridad-administrativa';
import {
  employmentChanges,
  parseProfile,
  profileDefinition,
  splitProfileFields,
} from '../../../core/dominio/politicas/perfil-usuario';

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
export class IdentidadUseCases extends CasosUsoBase {
  private dummy?: Promise<string>;
  constructor(
    db: BaseDatos,
    private readonly passwords: Contrasenas,
    private readonly tokens: Tokens,
    private readonly mail: Correo,
    private readonly requireEmailVerification = true,
    private readonly frontendUrl?: string,
  ) {
    super(db);
  }
  /** El correo sigue sin verificar; al reactivar la política se bloquea
   * nuevamente el acceso protegido de las cuentas que omitieron ese paso. */
  private effectiveState(user: Usuarios): string {
    return this.requireEmailVerification &&
      user.estado === 'activo' &&
      !user.emailVerificadoEn
      ? 'pendiente_email'
      : user.estado;
  }
  private async user(store: AlmacenDatos, actor: Actor): Promise<Usuarios> {
    const user = await store.one('usuarios', {
      id: actor.id,
      eliminadoEn: null,
    });
    if (!user) missing();
    return user;
  }
  private async sendToken(
    tx: Transaccion,
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
    const link = this.frontendUrl
      ? this.frontendUrl +
        '/#/' +
        (purpose === 'verificar_email' ? 'verify-email' : 'recover') +
        '?token=' +
        encodeURIComponent(token)
      : undefined;
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
        (link ? '\n\nAbre este enlace para continuar:\n' + link : '') +
        '\n\nNo compartas este código. ' +
        (purpose === 'verificar_email'
          ? 'El enlace vence en 24 horas.'
          : 'El enlace vence en una hora. Si no solicitaste el cambio, ignora este correo.'),
    );
  }
  private async consumeToken(
    tx: Transaccion,
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
  async register(input: unknown): Promise<Registro> {
    // El registro público siempre crea un usuario, nunca permite elegir un rol.
    const fields = employmentChanges(
      parseProfile(input, ['usuario'], ['email', 'password']),
    );
    const body = input as Registro;
    const { account, profile } = splitProfileFields(fields);
    const data = {
      ...account,
      nombre: v.text(body.nombre, 'nombre', 180),
      email: v.email(body.email),
    };
    const hash = await this.passwords.hash(v.password(body.password));
    const user = await this.db.transaction(async (tx) => {
      const user = await tx.store.insert('usuarios', {
        ...data,
        estado: this.requireEmailVerification ? 'pendiente_email' : 'activo',
      });
      await tx.store.insert('credenciales_usuario', {
        usuarioId: user.id,
        passwordHash: hash,
      });
      await tx.store.insert('perfiles_usuario', {
        usuarioId: user.id,
        ...profile,
      });
      await tx.store.insert('usuario_roles', {
        usuarioId: user.id,
        rolCodigo: 'usuario',
      });
      if (this.requireEmailVerification)
        await this.sendToken(tx, user, 'verificar_email');
      await this.audit(tx, undefined, 'cuenta.registrada', 'usuario', user.id);
      return user;
    });
    return {
      usuario: visible(user),
      verificacionEmailRequerida: this.requireEmailVerification,
      mensaje: this.requireEmailVerification
        ? 'Cuenta creada. Verifica tu correo antes de publicar o inscribirte.'
        : 'Cuenta creada. Puedes iniciar sesión; la verificación de correo está desactivada en desarrollo.',
    };
  }
  async login(input: unknown): Promise<Registro> {
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
      let locked = await tx.store.one(
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
      if (
        !this.requireEmailVerification &&
        locked.estado === 'pendiente_email'
      ) {
        [locked] = await tx.store.update(
          'usuarios',
          { id: locked.id },
          { estado: 'activo' },
        );
        await this.audit(
          tx,
          undefined,
          'cuenta.verificacion_omitida_desarrollo',
          'usuario',
          locked.id,
        );
      }
      return this.newSession(tx, locked);
    });
  }
  private async newSession(tx: Transaccion, user: Usuarios): Promise<Registro> {
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
      usuario: { ...visible(user), estado: this.effectiveState(user) },
      verificacionEmailRequerida: this.requireEmailVerification,
      roles: (await tx.store.find('usuario_roles', { usuarioId: user.id })).map(
        (row) => row.rolCodigo,
      ),
    };
  }
  /** Identidad ya validada por el proveedor; nunca combina cuentas solo por email. */
  async externalSession(
    tx: Transaccion,
    profile: IdentidadSocial,
    ownerId?: number,
    password?: unknown,
  ): Promise<Registro> {
    const link = await tx.store.one('identidades_externas', {
      proveedor: profile.proveedor,
      sujetoProveedor: profile.sujeto,
    });
    let user: Usuarios | undefined;
    let nuevo = false;
    if (ownerId !== undefined) {
      user = await tx.store.one('usuarios', { id: ownerId }, { lock: true });
      ensure(
        !link || link.usuarioId === ownerId,
        'Esta cuenta externa ya está vinculada a otra cuenta UniRed.',
        409,
        'SOCIAL_ALREADY_LINKED',
      );
    } else if (link)
      user = await tx.store.one(
        'usuarios',
        { id: link.usuarioId },
        { lock: true },
      );
    else {
      ensure(
        profile.email,
        'Facebook no compartió un correo. Crea una cuenta UniRed y vincula Facebook desde Seguridad, o utiliza Google.',
        400,
        'SOCIAL_EMAIL_REQUIRED',
      );
      const email = v.email(profile.email);
      user = await tx.store.one('usuarios', { email }, { lock: true });
      if (user) {
        ensure(
          !user.eliminadoEn &&
            ['activo', 'pendiente_email'].includes(user.estado),
          'Cuenta no disponible.',
          403,
          'SOCIAL_ACCOUNT_UNAVAILABLE',
        );
        const credential = await tx.store.one('credenciales_usuario', {
          usuarioId: user.id,
        });
        if (!credential) return { requiereAccesoPrevio: true };
        if (password === undefined) return { requierePassword: true };
        if (
          !(await this.passwords.verify(
            v.secret(password, 'passwordActual'),
            credential.passwordHash,
          ))
        )
          return { passwordIncorrecta: true };
      } else {
        nuevo = true;
        user = await tx.store.insert('usuarios', {
          nombre: v.text(profile.nombre, 'nombre', 180),
          email,
          estado:
            profile.emailVerificado || !this.requireEmailVerification
              ? 'activo'
              : 'pendiente_email',
          emailVerificadoEn: profile.emailVerificado ? new Date() : null,
        });
        await tx.store.insert('perfiles_usuario', { usuarioId: user.id });
        await tx.store.insert('usuario_roles', {
          usuarioId: user.id,
          rolCodigo: 'usuario',
        });
        if (this.requireEmailVerification && !profile.emailVerificado)
          await this.sendToken(tx, user, 'verificar_email');
        await this.audit(
          tx,
          undefined,
          'cuenta.registrada_social',
          'usuario',
          user.id,
          { proveedor: profile.proveedor },
        );
      }
    }
    ensure(
      user &&
        !user.eliminadoEn &&
        ['activo', 'pendiente_email'].includes(user.estado),
      'Cuenta no disponible.',
      403,
      'SOCIAL_ACCOUNT_UNAVAILABLE',
    );
    const other = await tx.store.one('identidades_externas', {
      usuarioId: user.id,
      proveedor: profile.proveedor,
    });
    ensure(
      !other || other.sujetoProveedor === profile.sujeto,
      'Ya vinculaste otra cuenta de este proveedor. Desvincúlala desde Seguridad antes de cambiarla.',
      409,
      'SOCIAL_ALREADY_LINKED',
    );
    if (!link)
      await tx.store.insert('identidades_externas', {
        usuarioId: user.id,
        proveedor: profile.proveedor,
        sujetoProveedor: profile.sujeto,
        correoProveedor: profile.email,
      });
    if (
      !user.emailVerificadoEn &&
      profile.emailVerificado &&
      user.email === profile.email
    ) {
      [user] = await tx.store.update(
        'usuarios',
        { id: user.id },
        { emailVerificadoEn: new Date(), estado: 'activo' },
      );
    }
    await this.audit(
      tx,
      undefined,
      ownerId ? 'cuenta.proveedor_vinculado' : 'cuenta.acceso_social',
      'usuario',
      user.id,
      { proveedor: profile.proveedor },
    );
    return {
      ...(await this.newSession(tx, user)),
      nuevo,
      vinculado: ownerId !== undefined,
    };
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
      estado: this.effectiveState(user),
      sessionId: session.id,
      roles: (
        await this.db.read.store.find('usuario_roles', { usuarioId: user.id })
      ).map((row) => row.rolCodigo),
    };
  }
  async refresh(input: unknown): Promise<Registro> {
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
  async logout(actor: Actor, all = false): Promise<Registro> {
    await this.db.read.store.update(
      'sesiones_usuario',
      all
        ? { usuarioId: actor.id, revocadaEn: null }
        : { id: actor.sessionId, usuarioId: actor.id },
      { revocadaEn: new Date() },
    );
    return { mensaje: 'Sesión cerrada.' };
  }
  async verifyEmail(input: unknown): Promise<Registro> {
    const body = v.object(input, ['token']);
    return this.db.transaction(async (tx) => {
      const token = await this.consumeToken(tx, body.token, 'verificar_email');
      const user = await tx.store.one(
        'usuarios',
        { id: token.usuarioId },
        { lock: true },
      );
      ensure(
        user &&
          !user.eliminadoEn &&
          (user.estado === 'pendiente_email' ||
            (user.estado === 'activo' && !user.emailVerificadoEn)),
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
  async resendVerification(actor: Actor): Promise<Registro> {
    return this.db.transaction(async (tx) => {
      const user = await this.user(tx.store, actor);
      ensure(
        ['pendiente_email', 'activo'].includes(user.estado) &&
          !user.emailVerificadoEn,
        'El correo ya fue verificado o la cuenta no está disponible.',
      );
      await this.sendToken(tx, user, 'verificar_email');
      return { mensaje: 'Correo de verificación encolado.' };
    });
  }
  async forgot(input: unknown): Promise<Registro> {
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
  async resetPassword(input: unknown): Promise<Registro> {
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
  async changePassword(actor: Actor, input: unknown): Promise<Registro> {
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
  async me(actor: Actor): Promise<Registro> {
    const user = await this.user(this.db.read.store, actor);
    const roles = (
      await this.db.read.store.find('usuario_roles', { usuarioId: actor.id })
    ).map((entry) => entry.rolCodigo);
    return {
      ...visible(user),
      tienePassword: Boolean(
        await this.db.read.store.one('credenciales_usuario', {
          usuarioId: user.id,
        }),
      ),
      estado: this.effectiveState(user),
      verificacionEmailRequerida: this.requireEmailVerification,
      roles,
      ...profileDefinition(roles),
      perfil: await this.db.read.store.one('perfiles_usuario', {
        usuarioId: actor.id,
      }),
    };
  }
  async changeEmail(actor: Actor, input: unknown): Promise<Registro> {
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
        {
          email,
          estado: this.requireEmailVerification ? 'pendiente_email' : 'activo',
          emailVerificadoEn: null,
        },
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
      if (this.requireEmailVerification)
        await this.sendToken(tx, updated, 'verificar_email');
      await this.mail.enqueue(
        tx.store,
        oldEmail,
        'Cambio de correo de tu cuenta UniRed',
        'El correo de tu cuenta fue cambiado. Si no reconoces esta acción, contacta al soporte.',
      );
      await this.audit(tx, actor, 'cuenta.email_cambiado', 'usuario', actor.id);
      return {
        verificacionEmailRequerida: this.requireEmailVerification,
        mensaje: this.requireEmailVerification
          ? 'Correo cambiado. Verifica la nueva dirección e inicia sesión nuevamente.'
          : 'Correo cambiado. Inicia sesión nuevamente; la verificación está desactivada en desarrollo.',
      };
    });
  }
  async sessions(actor: Actor): Promise<Registro[]> {
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
  async revokeSession(actor: Actor, sid: unknown): Promise<Registro> {
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
  async editProfile(actor: Actor, input: unknown): Promise<Registro> {
    await this.db.transaction(async (tx) => {
      // Comparte el bloqueo de cuenta con los cambios de roles administrativos.
      // La excepción se decide con roles almacenados, no con datos del formulario.
      const user = await tx.store.one(
        'usuarios',
        { id: actor.id, eliminadoEn: null },
        { lock: true },
      );
      if (!user) missing();
      const roles = (
        await tx.store.find('usuario_roles', { usuarioId: actor.id })
      ).map((entry) => entry.rolCodigo);
      const current = await tx.store.one(
        'perfiles_usuario',
        { usuarioId: actor.id },
        { lock: true },
      );
      if (!current) missing('Perfil no disponible.');
      // Los datos y las imágenes elegidas se confirman en una transacción.
      const imageFields = ['avatarArchivoId', 'bannerArchivoId'];
      const body = v.object(input, [
        ...profileDefinition(roles).camposPerfilEditables,
        ...imageFields,
      ]);
      const fields = employmentChanges(
        profileDefinition(roles).camposPerfilEditables.some(
          (key) => body[key] !== undefined,
        )
          ? parseProfile(body, roles, imageFields)
          : {},
        current,
      );
      for (const [key, purpose] of [
        ['avatarArchivoId', 'avatar'],
        ['bannerArchivoId', 'banner_perfil'],
      ]) {
        if (body[key] === undefined) continue;
        if (body[key] !== null)
          await this.file(tx.store, body[key], actor, purpose);
        fields[key] = body[key] === null ? null : v.id(body[key]);
      }
      ensure(Object.keys(fields).length > 0, 'No hay campos editables.');
      const { account, profile } = splitProfileFields(fields);
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
  async deactivate(actor: Actor): Promise<Registro> {
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
