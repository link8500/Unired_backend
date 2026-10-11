import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as nodemailer from 'nodemailer';
import { DataSource } from 'typeorm';
import { Mail, Store } from '../../domain/common/contracts';

/** Outbox cifrado y transaccional. Ningún token de recuperación aparece en la API. */
export class MailAdapter implements Mail {
  private readonly key: Buffer;
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly source: DataSource) {
    const raw = process.env.MAIL_ENCRYPTION_KEY;
    if (!raw || !/^[0-9a-f]{64}$/i.test(raw))
      throw new Error(
        'Ejecuta npm run setup:env para generar MAIL_ENCRYPTION_KEY.',
      );
    this.key = Buffer.from(raw, 'hex');
    if (
      process.env.NODE_ENV === 'production' &&
      process.env.MAIL_TRANSPORT !== 'smtp'
    )
      throw new Error(
        'Configura SMTP para producción; el buzón de archivos es solo de desarrollo.',
      );
  }
  async enqueue(
    store: Store,
    to: string,
    subject: string,
    text: string,
  ): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final(),
    ]);
    await store.insert('correos_salida', {
      destinatario: to,
      asunto: subject,
      cuerpoCifrado: {
        iv: iv.toString('hex'),
        tag: cipher.getAuthTag().toString('hex'),
        contenido: encrypted.toString('hex'),
      },
    });
  }
  private decrypt(input: unknown): string {
    if (!input || typeof input !== 'object')
      throw new Error('Sobre de correo inválido.');
    const envelope = input as Record<string, unknown>;
    if (
      typeof envelope.iv !== 'string' ||
      typeof envelope.tag !== 'string' ||
      typeof envelope.contenido !== 'string'
    )
      throw new Error('Sobre de correo inválido.');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(envelope.iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'hex'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.contenido, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }
  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.dispatch().catch(() =>
        console.error('No se pudo procesar el outbox de correo.'),
      );
    }, 1000);
    this.timer.unref();
  }
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    for (let attempt = 0; this.busy && attempt < 100; attempt++)
      await new Promise((resolve) => setTimeout(resolve, 100));
  }
  async dispatch(): Promise<void> {
    if (this.busy || !this.source.isInitialized) return;
    this.busy = true;
    try {
      await this.source.transaction(async (manager) => {
        const [mail] = await manager.query<
          {
            id: string;
            cuerpo_cifrado: unknown;
            destinatario: string;
            asunto: string;
          }[]
        >(
          'SELECT * FROM correos_salida WHERE enviado_en IS NULL AND intentos < 10 AND siguiente_intento_en <= CURRENT_TIMESTAMP ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED',
        );
        if (!mail) return;
        try {
          const text = this.decrypt(mail.cuerpo_cifrado);
          if ((process.env.MAIL_TRANSPORT ?? 'file') === 'smtp') {
            if (!process.env.SMTP_HOST || !process.env.SMTP_FROM)
              throw new Error('SMTP sin configurar.');
            const port = Number(process.env.SMTP_PORT ?? 587);
            const transport = nodemailer.createTransport({
              host: process.env.SMTP_HOST,
              port,
              secure: port === 465,
              requireTLS: port !== 465,
              ...(process.env.SMTP_USER
                ? {
                    auth: {
                      user: process.env.SMTP_USER,
                      pass: process.env.SMTP_PASSWORD,
                    },
                  }
                : {}),
              connectionTimeout: 10000,
              greetingTimeout: 10000,
              socketTimeout: 15000,
              disableFileAccess: true,
              disableUrlAccess: true,
            });
            await transport.sendMail({
              from: process.env.SMTP_FROM,
              to: mail.destinatario,
              subject: mail.asunto,
              text,
            });
          } else {
            const folder = resolve(
              process.env.MAIL_OUTBOX_ROOT ?? './.local-mails',
            );
            await mkdir(folder, { recursive: true });
            // El nombre no contiene correo ni token y la carpeta nunca se sirve por HTTP.
            await writeFile(
              resolve(folder, String(mail.id) + '.json'),
              JSON.stringify(
                {
                  to: mail.destinatario,
                  subject: mail.asunto,
                  text,
                },
                null,
                2,
              ),
              { mode: 0o600 },
            );
          }
          await manager.query(
            'UPDATE correos_salida SET enviado_en=CURRENT_TIMESTAMP,intentos=intentos+1 WHERE id=$1',
            [mail.id],
          );
        } catch {
          // No se registra el cuerpo del correo, destinatario, contraseña SMTP ni token.
          await manager.query(
            "UPDATE correos_salida SET intentos=intentos+1,siguiente_intento_en=CURRENT_TIMESTAMP + interval '1 minute' WHERE id=$1",
            [mail.id],
          );
          console.error(
            'Correo pendiente de reintento; comprueba la configuración de entrega.',
          );
        }
      });
    } finally {
      this.busy = false;
    }
  }
}
