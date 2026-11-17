import { configuracionSocial } from './acceso-social';

describe('Configuración del acceso social', () => {
  const keys = [
    'NODE_ENV',
    'API_PUBLIC_URL',
    'FRONTEND_URL',
    'CORS_ORIGINS',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'FACEBOOK_APP_ID',
    'FACEBOOK_APP_SECRET',
    'FACEBOOK_GRAPH_VERSION',
  ];
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  beforeEach(() => {
    keys.forEach((key) => delete process.env[key]);
    process.env.NODE_ENV = 'production';
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('permite seguir usando correo y contraseña sin configurar proveedores', () => {
    expect(configuracionSocial().desarrollo).toBe(false);
  });
  it('rechaza claves incompletas y exige orígenes HTTPS en producción', () => {
    process.env.API_PUBLIC_URL = 'https://api.example.test';
    process.env.FRONTEND_URL = 'https://app.example.test';
    process.env.GOOGLE_CLIENT_ID = 'cliente-ficticio';
    expect(() => configuracionSocial()).toThrow('GOOGLE_CLIENT_SECRET');
    process.env.GOOGLE_CLIENT_SECRET = 'secreto-ficticio';
    expect(configuracionSocial().apiPublica).toBe('https://api.example.test');
    for (const url of [
      'http://api.example.test',
      'https://api.example.test/api/v1',
      'https://usuario:clave@api.example.test',
      'https://api.example.test/?dato=1',
    ]) {
      process.env.API_PUBLIC_URL = url;
      expect(() => configuracionSocial()).toThrow();
    }
    process.env.API_PUBLIC_URL = 'https://api.example.test';
    delete process.env.FRONTEND_URL;
    expect(() => configuracionSocial()).toThrow('FRONTEND_URL');
  });
  it('acepta el entorno local y valida la versión explícita de Meta', () => {
    process.env.NODE_ENV = 'development';
    process.env.API_PUBLIC_URL = 'http://localhost:3000';
    process.env.FRONTEND_URL = 'http://localhost:62604';
    process.env.FACEBOOK_APP_ID = '12345';
    process.env.FACEBOOK_APP_SECRET = 'secreto-ficticio';
    process.env.FACEBOOK_GRAPH_VERSION = 'v27.0';
    expect(configuracionSocial().origenesPermitidos).toContain(
      'http://localhost:62604',
    );
    process.env.FACEBOOK_GRAPH_VERSION = '../otro';
    expect(() => configuracionSocial()).toThrow('FACEBOOK_GRAPH_VERSION');
  });
});
