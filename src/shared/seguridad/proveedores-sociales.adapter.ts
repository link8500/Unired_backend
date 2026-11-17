// OAuth de servidor. Los códigos se canjean aquí y los tokens externos no se persisten.
import { createHash, createHmac } from 'node:crypto';
import { OAuth2Client, CodeChallengeMethod } from 'google-auth-library';
import {
  ContextoSocial,
  IdentidadSocial,
  ProveedorSocial,
  ProveedoresAccesoSocial,
} from '../../core/dominio/comun/acceso-social';
import { ensure, ErrorDominio } from '../../core/dominio/comun/errores';

type FetchSocial = (
  url: string | URL,
  options?: RequestInit,
) => Promise<Response>;
export class ProveedoresSocialesAdapter implements ProveedoresAccesoSocial {
  private readonly google = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    transporterOptions: { timeout: 12000, retry: false },
  });
  constructor(private readonly request: FetchSocial = fetch) {}
  habilitados() {
    return {
      google: !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      facebook: !!(
        process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET
      ),
    };
  }
  private facebookVersion() {
    return process.env.FACEBOOK_GRAPH_VERSION || 'v27.0';
  }
  private verifier(estado: string) {
    return createHmac('sha256', process.env.GOOGLE_CLIENT_SECRET!)
      .update('unired-pkce:' + estado)
      .digest('base64url');
  }
  autorizacion(proveedor: ProveedorSocial, contexto: ContextoSocial): string {
    ensure(
      this.habilitados()[proveedor],
      'Este método de acceso todavía no está habilitado.',
      503,
      'SOCIAL_NOT_CONFIGURED',
    );
    if (proveedor === 'google')
      return this.google.generateAuthUrl({
        redirect_uri: contexto.callback,
        scope: ['openid', 'email', 'profile'],
        response_type: 'code',
        state: contexto.estado,
        nonce: contexto.nonce,
        prompt: 'select_account',
        code_challenge_method: CodeChallengeMethod.S256,
        code_challenge: createHash('sha256')
          .update(this.verifier(contexto.estado))
          .digest('base64url'),
      });
    const url = new URL(
      'https://www.facebook.com/' + this.facebookVersion() + '/dialog/oauth',
    );
    url.search = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID!,
      redirect_uri: contexto.callback,
      response_type: 'code',
      scope: 'public_profile,email',
      state: contexto.estado,
    }).toString();
    return url.toString();
  }
  private async json(url: string | URL, options: RequestInit = {}) {
    const response = await this.request(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
    });
    ensure(
      response.ok,
      'No pudimos completar el acceso con el proveedor.',
      502,
      'SOCIAL_PROVIDER_ERROR',
    );
    const body: unknown = await response.json();
    ensure(
      body && typeof body === 'object' && !Array.isArray(body),
      'Respuesta inválida del proveedor.',
      502,
      'SOCIAL_PROVIDER_ERROR',
    );
    return body as Record<string, unknown>;
  }
  async verificar(
    proveedor: ProveedorSocial,
    codigo: string,
    contexto: ContextoSocial,
  ): Promise<IdentidadSocial> {
    ensure(
      this.habilitados()[proveedor],
      'Este método de acceso todavía no está habilitado.',
      503,
      'SOCIAL_NOT_CONFIGURED',
    );
    try {
      if (proveedor === 'google') {
        const exchanged = await this.google.getToken({
          code: codigo,
          redirect_uri: contexto.callback,
          codeVerifier: this.verifier(contexto.estado),
        });
        ensure(
          exchanged.tokens.id_token,
          'Google no devolvió una identidad.',
          401,
          'SOCIAL_INVALID_IDENTITY',
        );
        const ticket = await this.google.verifyIdToken({
          idToken: exchanged.tokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        const profile = ticket.getPayload();
        ensure(
          profile &&
            profile.nonce === contexto.nonce &&
            profile.sub &&
            profile.email &&
            profile.email_verified === true,
          'La identidad de Google no es válida.',
          401,
          'SOCIAL_INVALID_IDENTITY',
        );
        return {
          proveedor,
          sujeto: profile.sub,
          nombre: (
            profile.name ||
            profile.given_name ||
            'Usuario de UniRed'
          ).slice(0, 180),
          email: profile.email,
          emailVerificado:
            profile.email.endsWith('@gmail.com') || Boolean(profile.hd),
        };
      }
      const graph = 'https://graph.facebook.com/' + this.facebookVersion();
      const exchanged = await this.json(graph + '/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: process.env.FACEBOOK_APP_ID!,
          client_secret: process.env.FACEBOOK_APP_SECRET!,
          redirect_uri: contexto.callback,
          code: codigo,
        }),
      });
      ensure(
        typeof exchanged.access_token === 'string',
        'Facebook no devolvió un acceso válido.',
        401,
        'SOCIAL_INVALID_IDENTITY',
      );
      const token = exchanged.access_token;
      const debug = new URL(graph + '/debug_token');
      debug.searchParams.set('input_token', token);
      const inspected = await this.json(debug, {
        headers: {
          Authorization:
            'Bearer ' +
            process.env.FACEBOOK_APP_ID +
            '|' +
            process.env.FACEBOOK_APP_SECRET,
        },
      });
      const data = inspected.data as Record<string, unknown> | undefined;
      const now = Math.floor(Date.now() / 1000);
      ensure(
        data?.is_valid === true &&
          data.app_id === process.env.FACEBOOK_APP_ID &&
          data.type === 'USER' &&
          typeof data.user_id === 'string' &&
          Number(data.expires_at) > now &&
          (!data.data_access_expires_at ||
            Number(data.data_access_expires_at) > now),
        'El acceso de Facebook no pertenece a esta aplicación o ha vencido.',
        401,
        'SOCIAL_INVALID_IDENTITY',
      );
      const userUrl = new URL(graph + '/me');
      userUrl.searchParams.set('fields', 'id,name,email');
      userUrl.searchParams.set(
        'appsecret_proof',
        createHmac('sha256', process.env.FACEBOOK_APP_SECRET!)
          .update(token)
          .digest('hex'),
      );
      const profile = await this.json(userUrl, {
        headers: { Authorization: 'Bearer ' + token },
      });
      ensure(
        profile.id === data.user_id && typeof profile.name === 'string',
        'La identidad de Facebook no coincide.',
        401,
        'SOCIAL_INVALID_IDENTITY',
      );
      return {
        proveedor,
        sujeto: data.user_id,
        nombre: profile.name.slice(0, 180),
        email: typeof profile.email === 'string' ? profile.email : null,
        emailVerificado: false,
      };
    } catch (error) {
      if (error instanceof ErrorDominio) throw error;
      throw new ErrorDominio(
        502,
        'SOCIAL_PROVIDER_ERROR',
        'No pudimos confirmar tu identidad. Inténtalo de nuevo.',
      );
    }
  }
}
