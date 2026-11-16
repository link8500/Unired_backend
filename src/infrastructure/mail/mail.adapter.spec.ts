import { DataSource } from 'typeorm';
import { Store } from '../../domain/common/contracts';
import { MailAdapter } from './mail.adapter';

describe('Outbox cifrado y entrega por HTTPS', () => {
  const keys = [
    'NODE_ENV',
    'MAIL_TRANSPORT',
    'MAIL_ENCRYPTION_KEY',
    'RESEND_API_KEY',
    'MAIL_FROM',
  ] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.MAIL_TRANSPORT = 'resend';
    process.env.MAIL_ENCRYPTION_KEY = '12'.repeat(32);
    process.env.RESEND_API_KEY = 're_ficticia_solo_para_pruebas';
    process.env.MAIL_FROM = 'UniRed <onboarding@resend.dev>';
  });
  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it.each([true, false])(
    'solo marca como enviado un correo confirmado: %s',
    async (accepted) => {
      const send = jest
        .spyOn(globalThis, 'fetch')
        .mockImplementation(
          async () =>
            new Response(
              JSON.stringify(
                accepted
                  ? { id: 'mail-1' }
                  : { message: 'Error del proveedor' },
              ),
              { status: accepted ? 200 : 503 },
            ),
        );
      const log = jest.spyOn(console, 'error').mockImplementation(() => {});
      let envelope: unknown;
      const query = jest.fn(async (sql: string) =>
        sql.startsWith('SELECT')
          ? [
              {
                id: '8',
                destinatario: 'demo@example.test',
                asunto: 'Verificación',
                cuerpo_cifrado: envelope,
              },
            ]
          : [],
      );
      const source = {
        isInitialized: true,
        transaction: async (
          work: (manager: { query: typeof query }) => Promise<void>,
        ) => work({ query }),
      } as unknown as DataSource;
      const adapter = new MailAdapter(source);
      const insert = jest.fn(
        async (_table: string, row: Record<string, unknown>) => {
          envelope = row.cuerpoCifrado;
          return row;
        },
      );
      await adapter.enqueue(
        { insert } as unknown as Store,
        'demo@example.test',
        'Verificación',
        'token-de-prueba',
      );
      expect(JSON.stringify(envelope)).not.toContain('token-de-prueba');
      await adapter.dispatch();
      expect(send).toHaveBeenCalledTimes(1);
      const updates = query.mock.calls
        .map(([sql]) => sql)
        .filter((sql) => sql.startsWith('UPDATE'));
      expect(updates).toHaveLength(1);
      expect(updates[0].includes('enviado_en=CURRENT_TIMESTAMP')).toBe(
        accepted,
      );
      expect(updates[0].includes('siguiente_intento_en')).toBe(!accepted);
      expect(JSON.stringify(log.mock.calls)).not.toContain('demo@example.test');
      expect(JSON.stringify(log.mock.calls)).not.toContain('token-de-prueba');
    },
  );

  it('mantiene el buzón de archivos restringido a desarrollo y pruebas', () => {
    process.env.MAIL_TRANSPORT = 'file';
    expect(() => new MailAdapter({} as DataSource)).toThrow(
      'buzón de archivos',
    );
    process.env.NODE_ENV = 'development';
    expect(() => new MailAdapter({} as DataSource)).not.toThrow();
  });
  it('rechaza proveedores desconocidos y credenciales HTTPS incompletas', () => {
    process.env.MAIL_TRANSPORT = 'otro';
    expect(() => new MailAdapter({} as DataSource)).toThrow('MAIL_TRANSPORT');
    process.env.MAIL_TRANSPORT = 'resend';
    delete process.env.RESEND_API_KEY;
    expect(() => new MailAdapter({} as DataSource)).toThrow('RESEND_API_KEY');
  });
});
