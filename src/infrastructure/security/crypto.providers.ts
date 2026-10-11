import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { JwtService } from '@nestjs/jwt';
import { Passwords, Tokens } from '../../domain/common/contracts';
import { DomainError } from '../../domain/common/errors';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, result) => (error ? reject(error) : resolve(result)),
    ),
  );
}
/** Hash lento con sal independiente. La contraseña jamás se guarda ni se registra. */
export class ScryptPasswords implements Passwords {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const hash = await derive(password, salt);
    return (
      'scrypt$32768$8$1$' + salt.toString('hex') + '$' + hash.toString('hex')
    );
  }
  async verify(password: string, encoded: string): Promise<boolean> {
    const match = encoded.match(
      /^scrypt\$32768\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{128})$/,
    );
    if (!match) return false;
    const expected = Buffer.from(match[2], 'hex');
    return timingSafeEqual(
      await derive(password, Buffer.from(match[1], 'hex')),
      expected,
    );
  }
}
export class JwtTokens implements Tokens {
  private readonly jwt: JwtService;
  constructor() {
    const secret = process.env.JWT_ACCESS_SECRET;
    if (!secret || secret.length < 32 || secret.includes('GENERAR'))
      throw new Error(
        'Ejecuta npm run setup:env para generar JWT_ACCESS_SECRET.',
      );
    this.jwt = new JwtService({
      secret,
      signOptions: {
        algorithm: 'HS256',
        issuer: 'unired-api',
        audience: 'unired-clients',
        expiresIn: 900,
      },
    });
  }
  uuid(): string {
    return randomUUID();
  }
  random(): string {
    return randomBytes(32).toString('base64url');
  }
  digest(token: string): Buffer {
    return createHash('sha256').update(token).digest();
  }
  access(userId: number, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, sid: sessionId });
  }
  fileAccess(
    userId: number,
    sessionId: string,
    fileId: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, fileId, purpose: 'file' },
      { audience: 'unired-files', expiresIn: 120 },
    );
  }
  async verifyFileAccess(
    token: string,
  ): Promise<{ sub: number; sid: string; fileId: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: number;
        sid: string;
        fileId: string;
        purpose: string;
      }>(token, {
        algorithms: ['HS256'],
        issuer: 'unired-api',
        audience: 'unired-files',
      });
      if (
        payload.purpose !== 'file' ||
        !Number.isInteger(payload.sub) ||
        typeof payload.sid !== 'string' ||
        typeof payload.fileId !== 'string'
      )
        throw new Error();
      return payload;
    } catch {
      throw new DomainError(
        401,
        'INVALID_FILE_TICKET',
        'Enlace de archivo inválido o vencido.',
      );
    }
  }
  async verifyAccess(token: string): Promise<{ sub: number; sid: string }> {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: number; sid: string }>(
        token,
        {
          algorithms: ['HS256'],
          issuer: 'unired-api',
          audience: 'unired-clients',
        },
      );
      if (
        !Number.isInteger(payload.sub) ||
        payload.sub < 1 ||
        typeof payload.sid !== 'string'
      )
        throw new Error();
      return payload;
    } catch {
      throw new DomainError(401, 'INVALID_TOKEN', 'Sesión inválida o vencida.');
    }
  }
}
