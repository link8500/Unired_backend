import { generateKeyPairSync, sign } from 'node:crypto';
import { OAuth2Client } from 'google-auth-library';
import { ProveedoresSocialesAdapter } from './proveedores-sociales.adapter';

describe('Validación de proveedores externos', () => {
  const saved = { ...process.env };
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'cliente-google-prueba';
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-google-prueba';
    process.env.FACEBOOK_APP_ID = 'facebook-prueba';
    process.env.FACEBOOK_APP_SECRET = 'secreto-facebook-prueba';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of [
      'GOOGLE_CLIENT_ID',
      'GOOGLE_CLIENT_SECRET',
      'FACEBOOK_APP_ID',
      'FACEBOOK_APP_SECRET',
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });
  const context = {
    estado: 'estado-aleatorio-exclusivo-de-esta-prueba',
    nonce: 'nonce-de-prueba',
    callback: 'http://localhost:3000/api/v1/auth/social/google/callback',
  };
  function jwt(changes: Record<string, unknown> = {}) {
    const now = Math.floor(Date.now() / 1000);
    const head = Buffer.from(
      JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        iss: 'https://accounts.google.com',
        aud: 'cliente-google-prueba',
        iat: now,
        exp: now + 3600,
        sub: 'google-user',
        nonce: context.nonce,
        email: 'user@gmail.com',
        email_verified: true,
        name: 'Usuario Google',
        ...changes,
      }),
    ).toString('base64url');
    return (
      head +
      '.' +
      body +
      '.' +
      sign('RSA-SHA256', Buffer.from(head + '.' + body), privateKey).toString(
        'base64url',
      )
    );
  }
  function googleAdapter(changes: Record<string, unknown> = {}) {
    const adapter = new ProveedoresSocialesAdapter();
    const google = (adapter as unknown as { google: OAuth2Client }).google;
    jest
      .spyOn(google, 'getToken')
      .mockResolvedValue({ tokens: { id_token: jwt(changes) } } as never);
    jest.spyOn(google, 'getFederatedSignonCertsAsync').mockResolvedValue({
      certs: {
        'test-key': publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      format: 'PEM',
    } as never);
    return { adapter, google };
  }
  it('Google: la biblioteca verifica la firma y el cliente, y el adaptador comprueba el nonce', async () => {
    const { adapter, google } = googleAdapter();
    const profile = await adapter.verificar('google', 'codigo', context);
    expect(profile.sujeto).toBe('google-user');
    expect(profile.emailVerificado).toBe(true);
    expect(google.getToken).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'codigo',
        redirect_uri: context.callback,
        codeVerifier: expect.stringMatching(/^[\w-]{43}$/),
      }),
    );
    const url = new URL(adapter.autorizacion('google', context));
    expect(url.searchParams.get('nonce')).toBe(context.nonce);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
  });
  for (const [label, changes] of Object.entries({
    cliente: { aud: 'otro-cliente' },
    emisor: { iss: 'https://evil.example' },
    caducidad: {
      iat: Math.floor(Date.now() / 1000) - 3600,
      exp: Math.floor(Date.now() / 1000) - 600,
    },
    nonce: { nonce: 'nonce-robado' },
    correo: { email_verified: false },
  })) {
    it('Google: rechaza ' + label + ' inválido', async () => {
      await expect(
        googleAdapter(changes).adapter.verificar('google', 'codigo', context),
      ).rejects.toThrow();
    });
  }
  it('Google: un correo ajeno a Google no omite la verificación propia', async () => {
    const { adapter } = googleAdapter({ email: 'usuario@empresa.example' });
    expect(
      (await adapter.verificar('google', 'codigo', context)).emailVerificado,
    ).toBe(false);
  });
  function facebook(
    appId = 'facebook-prueba',
    expires = Math.floor(Date.now() / 1000) + 3600,
    id = 'fb-user',
  ) {
    const replies = [
      { access_token: 'token-facebook-solo-fixture' },
      {
        data: {
          is_valid: true,
          type: 'USER',
          app_id: appId,
          user_id: 'fb-user',
          expires_at: expires,
          scopes: ['public_profile', 'email'],
        },
      },
      { id, name: 'Usuario Facebook', email: 'usuario@example.test' },
    ];
    const request = jest.fn(
      async () =>
        new Response(JSON.stringify(replies.shift()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    return { adapter: new ProveedoresSocialesAdapter(request), request };
  }
  it('Facebook: comprueba aplicación, vigencia, usuario y appsecret_proof sin persistir tokens', async () => {
    const { adapter, request } = facebook();
    const value = await adapter.verificar('facebook', 'codigo', context);
    expect(value.sujeto).toBe('fb-user');
    expect(value.emailVerificado).toBe(false);
    expect(Object.keys(value)).not.toContain('access_token');
    const calls = request.mock.calls as unknown as [
      string | URL,
      RequestInit,
    ][];
    expect(calls[0][1].method).toBe('POST');
    expect(new URL(calls[2][0]).searchParams.get('appsecret_proof')).toMatch(
      /^[a-f0-9]{64}$/,
    );
    expect((calls[2][1].headers as Record<string, string>).Authorization).toBe(
      'Bearer token-facebook-solo-fixture',
    );
  });
  it('Facebook: rechaza un token de otra aplicación', async () => {
    await expect(
      facebook('otro-cliente').adapter.verificar('facebook', 'codigo', context),
    ).rejects.toThrow();
  });
  it('Facebook: rechaza un token vencido', async () => {
    await expect(
      facebook('facebook-prueba', 1).adapter.verificar(
        'facebook',
        'codigo',
        context,
      ),
    ).rejects.toThrow();
  });
  it('Facebook: rechaza perfiles que no coinciden con el token', async () => {
    await expect(
      facebook(
        'facebook-prueba',
        Math.floor(Date.now() / 1000) + 1000,
        'otro-usuario',
      ).adapter.verificar('facebook', 'codigo', context),
    ).rejects.toThrow();
  });
});
