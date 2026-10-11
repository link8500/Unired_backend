import { JwtTokens, ScryptPasswords } from './crypto.providers';

describe('Criptografía y separación de tokens', () => {
  const secret = process.env.JWT_ACCESS_SECRET;
  beforeAll(() => {
    process.env.JWT_ACCESS_SECRET =
      'clave-exclusiva-de-prueba-no-usar-en-produccion-123';
  });
  afterAll(() => {
    if (secret === undefined) delete process.env.JWT_ACCESS_SECRET;
    else process.env.JWT_ACCESS_SECRET = secret;
  });
  it('no almacena texto plano y distingue contraseñas', async () => {
    const passwords = new ScryptPasswords();
    const hash = await passwords.hash('Clave-ficticia-123456');
    expect(hash).not.toContain('Clave-ficticia');
    expect(await passwords.verify('Clave-ficticia-123456', hash)).toBe(true);
    expect(await passwords.verify('Otra-clave-123456', hash)).toBe(false);
    expect(await passwords.verify('cualquiera', 'hash inválido')).toBe(false);
  });
  it('access tokens y enlaces de archivos no se intercambian', async () => {
    const tokens = new JwtTokens();
    const sid = tokens.uuid();
    const access = await tokens.access(1, sid);
    const file = await tokens.fileAccess(1, sid, '7');
    expect((await tokens.verifyAccess(access)).sub).toBe(1);
    expect((await tokens.verifyFileAccess(file)).fileId).toBe('7');
    await expect(tokens.verifyAccess(file)).rejects.toThrow();
    await expect(tokens.verifyFileAccess(access)).rejects.toThrow();
  });
  it('tokens aleatorios y hashes tienen el tamaño adecuado', () => {
    const tokens = new JwtTokens();
    const one = tokens.random();
    const two = tokens.random();
    expect(one).not.toEqual(two);
    expect(tokens.digest(one)).toHaveLength(32);
  });
});
