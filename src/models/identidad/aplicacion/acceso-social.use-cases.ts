// Coordina OAuth, vinculación y canje de un solo uso. Sin HTTP, cookies ni SDK.
import {
  Actor,
  BaseDatos,
  Registro,
  Tokens,
} from '../../../core/dominio/comun/contratos';
import {
  ConfiguracionAccesoSocial,
  IdentidadSocial,
  ProveedorSocial,
  proveedoresSociales,
  ProveedoresAccesoSocial,
} from '../../../core/dominio/comun/acceso-social';
import { ensure, ErrorDominio } from '../../../core/dominio/comun/errores';
import * as v from '../../../core/dominio/comun/validaciones';
import { CasosUsoBase } from '../../../core/aplicacion/casos-uso-base';
import { IdentidadUseCases } from './identidad.use-cases';

export class AccesoSocialUseCases extends CasosUsoBase {
  constructor(
    db: BaseDatos,
    private readonly tokens: Tokens,
    private readonly proveedores: ProveedoresAccesoSocial,
    private readonly identidad: IdentidadUseCases,
    private readonly config: ConfiguracionAccesoSocial,
  ) {
    super(db);
  }
  providers() {
    return this.proveedores.habilitados();
  }
  private provider(raw: unknown) {
    return v.choice(raw, proveedoresSociales, 'proveedor');
  }
  private origin(raw: unknown): string {
    const value = v.text(raw, 'origen', 400);
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ErrorDominio(
        400,
        'SOCIAL_INVALID_ORIGIN',
        'Origen de la página no válido.',
      );
    }
    ensure(
      url.origin === value &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password,
      'Origen de la página no válido.',
      400,
      'SOCIAL_INVALID_ORIGIN',
    );
    const local =
      this.config.desarrollo &&
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value);
    ensure(
      local || this.config.origenesPermitidos.includes(value),
      'Esta página no está autorizada para recibir el acceso.',
      400,
      'SOCIAL_INVALID_ORIGIN',
    );
    return url.origin;
  }
  private callback(provider: ProveedorSocial) {
    return (
      this.config.apiPublica + '/api/v1/auth/social/' + provider + '/callback'
    );
  }
  private returnUrl(origin: string, data: Record<string, string>) {
    const url = new URL(origin);
    url.hash = '/auth/social?' + new URLSearchParams(data);
    return url.toString();
  }
  async cleanup() {
    await this.db.read.store.remove('flujos_acceso_social', {
      expiraEn: { op: 'lt', value: new Date() },
    });
  }
  async start(rawProvider: unknown, input: unknown, actor?: Actor) {
    const provider = this.provider(rawProvider);
    const body = v.object(input, ['origen', 'reto']);
    ensure(
      this.providers()[provider],
      'Este método todavía no está habilitado.',
      503,
      'SOCIAL_NOT_CONFIGURED',
    );
    const origin = this.origin(body.origen);
    const challenge = v.text(body.reto, 'reto', 43, 43);
    ensure(/^[A-Za-z0-9_-]{43}$/.test(challenge), 'Reto de acceso no válido.');
    await this.cleanup();
    const state = this.tokens.random(),
      nonce = this.tokens.random();
    await this.db.read.store.insert('flujos_acceso_social', {
      proveedor: provider,
      estadoHash: this.tokens.digest(state),
      retoCliente: challenge,
      nonce,
      origenFrontend: origin,
      usuarioVinculacionId: actor?.id ?? null,
      sesionVinculacionId: actor?.sessionId ?? null,
      expiraEn: new Date(Date.now() + 10 * 60000),
    });
    return {
      url: this.proveedores.autorizacion(provider, {
        estado: state,
        nonce,
        callback: this.callback(provider),
      }),
    };
  }
  async callbackResult(rawProvider: unknown, query: Registro): Promise<string> {
    const provider = this.provider(rawProvider);
    const state = v.text(query.state, 'state', 200, 20);
    const flow = await this.db.read.store.one('flujos_acceso_social', {
      estadoHash: this.tokens.digest(state),
      proveedor: provider,
    });
    ensure(
      flow,
      'El intento de acceso no existe o ha caducado.',
      400,
      'SOCIAL_INVALID_STATE',
    );
    try {
      await this.db.transaction(async (tx) => {
        const current = await tx.store.one(
          'flujos_acceso_social',
          { id: flow.id },
          { lock: true },
        );
        ensure(
          current &&
            !current.callbackUsadoEn &&
            new Date(current.expiraEn) > new Date(),
          'El intento de acceso ya se usó o ha caducado.',
          400,
          'SOCIAL_INVALID_STATE',
        );
        await tx.store.update(
          'flujos_acceso_social',
          { id: flow.id },
          { callbackUsadoEn: new Date() },
        );
      });
      ensure(
        query.error === undefined,
        'Se canceló el acceso con el proveedor.',
        400,
        'SOCIAL_CANCELLED',
      );
      const code = v.text(query.code, 'code', 4096, 1);
      const identity = await this.proveedores.verificar(provider, code, {
        estado: state,
        nonce: flow.nonce,
        callback: this.callback(provider),
      });
      ensure(
        identity.proveedor === provider,
        'La identidad pertenece a otro proveedor.',
        401,
        'SOCIAL_INVALID_IDENTITY',
      );
      const ticket = this.tokens.random();
      await this.db.read.store.update(
        'flujos_acceso_social',
        { id: flow.id },
        {
          sujetoProveedor: v.text(identity.sujeto, 'identificador', 200),
          nombreProveedor: v.text(identity.nombre, 'nombre', 180),
          correoProveedor: identity.email ? v.email(identity.email) : null,
          correoVerificado: identity.emailVerificado === true,
          codigoHash: this.tokens.digest(ticket),
          expiraEn: new Date(Date.now() + 2 * 60000),
        },
      );
      return this.returnUrl(flow.origenFrontend, { codigo: ticket });
    } catch (error) {
      const code =
        error instanceof ErrorDominio &&
        [
          'SOCIAL_CANCELLED',
          'SOCIAL_NOT_CONFIGURED',
          'SOCIAL_INVALID_STATE',
        ].includes(error.code)
          ? error.code
          : 'SOCIAL_PROVIDER_ERROR';
      return this.returnUrl(flow.origenFrontend, { error: code });
    }
  }
  async exchange(input: unknown): Promise<Registro> {
    const body = v.object(input, ['codigo', 'verificador', 'passwordActual']);
    const code = v.text(body.codigo, 'codigo', 200, 20),
      verifier = v.text(body.verificador, 'verificador', 128, 43);
    ensure(
      /^[A-Za-z0-9_-]+$/.test(verifier),
      'Verificador de acceso inválido.',
    );
    const result = await this.db.transaction(async (tx) => {
      const flow = await tx.store.one(
        'flujos_acceso_social',
        { codigoHash: this.tokens.digest(code) },
        { lock: true },
      );
      ensure(
        flow &&
          !flow.canjeadoEn &&
          flow.callbackUsadoEn &&
          flow.sujetoProveedor &&
          new Date(flow.expiraEn) > new Date(),
        'El acceso ya se usó o ha caducado. Vuelve a iniciarlo.',
        400,
        'SOCIAL_INVALID_TICKET',
      );
      ensure(
        flow.retoCliente === this.tokens.digest(verifier).toString('base64url'),
        'El acceso debe completarse desde la pestaña donde lo iniciaste.',
        400,
        'SOCIAL_INVALID_VERIFIER',
      );
      ensure(
        flow.intentosConfirmacion < 5,
        'Se alcanzó el límite de intentos. Inicia el acceso otra vez.',
        429,
        'SOCIAL_TOO_MANY_ATTEMPTS',
      );
      if (flow.usuarioVinculacionId) {
        const session = await tx.store.one('sesiones_usuario', {
          id: flow.sesionVinculacionId!,
          usuarioId: flow.usuarioVinculacionId,
        });
        ensure(
          session &&
            !session.revocadaEn &&
            new Date(session.expiraEn) > new Date(),
          'Tu sesión de UniRed terminó. Inicia sesión antes de vincular la cuenta.',
          401,
          'SOCIAL_LINK_SESSION_EXPIRED',
        );
      }
      const profile: IdentidadSocial = {
        proveedor: this.provider(flow.proveedor),
        sujeto: flow.sujetoProveedor,
        nombre: flow.nombreProveedor!,
        email: flow.correoProveedor,
        emailVerificado: flow.correoVerificado,
      };
      const value = await this.identidad.externalSession(
        tx,
        profile,
        flow.usuarioVinculacionId ?? undefined,
        body.passwordActual,
      );
      if (value.passwordIncorrecta) {
        await tx.store.update(
          'flujos_acceso_social',
          { id: flow.id },
          { intentosConfirmacion: flow.intentosConfirmacion + 1 },
        );
        return value;
      }
      if (value.requierePassword || value.requiereAccesoPrevio)
        return { ...value, proveedor: flow.proveedor };
      await tx.store.update(
        'flujos_acceso_social',
        { id: flow.id },
        {
          canjeadoEn: new Date(),
          nonce: 'consumido',
          correoProveedor: null,
          nombreProveedor: null,
          sujetoProveedor: null,
        },
      );
      return value;
    });
    ensure(
      !result.passwordIncorrecta,
      'La contraseña de UniRed no es correcta.',
      401,
      'SOCIAL_PASSWORD_INVALID',
    );
    return result;
  }
  async linked(actor: Actor) {
    const identities = await this.db.read.store.find('identidades_externas', {
      usuarioId: actor.id,
    });
    return {
      proveedores: this.providers(),
      tienePassword: Boolean(
        await this.db.read.store.one('credenciales_usuario', {
          usuarioId: actor.id,
        }),
      ),
      identidades: identities.map((i) => ({
        proveedor: i.proveedor,
        correo: i.correoProveedor,
        creadoEn: i.creadoEn,
      })),
    };
  }
  async unlink(actor: Actor, rawProvider: unknown) {
    const provider = this.provider(rawProvider);
    return this.db.transaction(async (tx) => {
      await tx.store.one('usuarios', { id: actor.id }, { lock: true });
      const count = await tx.store.count('identidades_externas', {
        usuarioId: actor.id,
      });
      const credential = await tx.store.one('credenciales_usuario', {
        usuarioId: actor.id,
      });
      ensure(
        credential || count > 1,
        'Añade una contraseña u otro método antes de quitar tu único acceso.',
        409,
        'SOCIAL_LAST_METHOD',
      );
      await tx.store.remove('identidades_externas', {
        usuarioId: actor.id,
        proveedor: provider,
      });
      await tx.store.remove('flujos_acceso_social', {
        usuarioVinculacionId: actor.id,
      });
      await tx.store.update(
        'sesiones_usuario',
        {
          usuarioId: actor.id,
          id: { op: 'ne', value: actor.sessionId },
          revocadaEn: null,
        },
        { revocadaEn: new Date() },
      );
      await this.audit(
        tx,
        actor,
        'cuenta.proveedor_desvinculado',
        'usuario',
        actor.id,
        { proveedor: provider },
      );
      return {
        mensaje:
          'Cuenta desvinculada. Las otras sesiones se cerraron; puedes continuar en esta.',
      };
    });
  }
}
