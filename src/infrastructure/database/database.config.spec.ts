import { databaseConnection } from './database.config';

describe('Conexión local y PostgreSQL en la nube', () => {
  it('conserva la base local sin SSL cuando no se proporciona URL', () => {
    expect(databaseConnection({ DB_PASSWORD: 'local-test' })).toMatchObject({
      host: '127.0.0.1',
      port: 5433,
      username: 'unired',
      database: 'unired',
      ssl: false,
    });
  });
  it('da prioridad a la URL, verifica el certificado y habilita channel binding', () => {
    const config = databaseConnection({
      NODE_ENV: 'production',
      DB_HOST: 'localhost',
      DATABASE_URL:
        'postgresql://user:private%40value@database.example.test/neondb?sslmode=require&channel_binding=require',
    });
    expect(config).toMatchObject({
      host: 'database.example.test',
      port: 5432,
      username: 'user',
      password: 'private@value',
      database: 'neondb',
      ssl: { rejectUnauthorized: true },
      extra: { enableChannelBinding: true },
    });
    expect(config).not.toHaveProperty('url');
  });
  it('admite parámetros separados con SSL en producción', () => {
    expect(
      databaseConnection({
        NODE_ENV: 'production',
        DB_PASSWORD: 'test',
        DB_SSL: 'true',
      }).ssl,
    ).toEqual({ rejectUnauthorized: true });
  });
  it.each([
    'not-a-url',
    'https://secret.example/db',
    'postgresql://user:secret@host/db?sslmode=no-verify',
    'postgresql://user:secret@host/db?sslmode=disable&channel_binding=require',
  ])('rechaza una URL inválida sin filtrarla: %s', (value) => {
    expect(() => databaseConnection({ DATABASE_URL: value })).toThrow(
      'DATABASE_URL inválida.',
    );
    try {
      databaseConnection({ DATABASE_URL: value });
    } catch (error) {
      expect(String(error)).not.toContain(value);
    }
  });
  it('rechaza desactivar TLS en producción', () => {
    expect(() =>
      databaseConnection({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://user:test@localhost/db?sslmode=disable',
      }),
    ).toThrow('requiere SSL');
  });
  it.each(['invalid', '0', '65536'])('rechaza el puerto %s', (port) => {
    expect(() =>
      databaseConnection({ DB_PASSWORD: 'test', DB_PORT: port }),
    ).toThrow('DB_PORT inválido');
  });
});
