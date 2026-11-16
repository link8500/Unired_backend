// Archivo: src/shared/correo/resend.transport.ts
// Envía solicitudes de correo a Resend mediante HTTPS.

import { createHash } from 'node:crypto';

export interface OutgoingMail {
  id: string;
  to: string;
  subject: string;
  text: string;
}

/** Transporte HTTPS para alojamientos sin puertos SMTP. No registra claves,
 * destinatarios ni tokens. Un reintento conserva su clave de idempotencia. */
export class ResendTransport {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly request: typeof fetch = fetch,
  ) {
    if (!apiKey.startsWith('re_') || apiKey.length < 12)
      throw new Error('Configura RESEND_API_KEY para enviar por HTTPS.');
    if (!from.trim() || !from.includes('@') || /[\r\n]/.test(from))
      throw new Error('Configura MAIL_FROM con tu remitente de Resend.');
  }

  async send(mail: OutgoingMail): Promise<void> {
    const payload = {
      from: this.from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    };
    const fingerprint = createHash('sha256')
      .update(mail.id + '\0' + JSON.stringify(payload))
      .digest('hex');
    try {
      const response = await this.request('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + this.apiKey,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'unired-mail-' + fingerprint,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
        redirect: 'error',
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('id' in result) ||
        typeof result.id !== 'string' ||
        !result.id
      )
        throw new Error();
    } catch {
      // El proveedor puede incluir datos privados en sus errores. El outbox
      // conserva el correo cifrado y programa el reintento sin publicarlos.
      throw new Error('No se pudo entregar el correo mediante Resend.');
    }
  }
}
