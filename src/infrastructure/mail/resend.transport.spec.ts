import { ResendTransport } from './resend.transport';

describe('Correo HTTPS con Resend', () => {
  const key = 're_clave_ficticia_solo_pruebas';
  const from = 'UniRed <onboarding@resend.dev>';
  const mail = {
    id: '27',
    to: 'alumno@example.test',
    subject: 'Verifica tu correo',
    text: 'Token-ficticio-no-real',
  };
  const request = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  beforeEach(() => request.mockReset());

  it('envía el contenido por HTTPS sin puertos SMTP', async () => {
    request.mockResolvedValue(
      new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }),
    );
    await new ResendTransport(key, from, request).send(mail);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(options).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      from,
      to: [mail.to],
      subject: mail.subject,
      text: mail.text,
    });
  });
  it('conserva la identidad del reintento y distingue correos distintos', async () => {
    request.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: 'mail-1' }), { status: 200 }),
    );
    const sender = new ResendTransport(key, from, request);
    await sender.send(mail);
    await sender.send(mail);
    await sender.send({ ...mail, text: 'Otro token' });
    const headers = request.mock.calls.map(
      (call) => call[1]?.headers as Record<string, string>,
    );
    expect(headers[0]['Idempotency-Key']).toBe(headers[1]['Idempotency-Key']);
    expect(headers[0]['Idempotency-Key']).not.toBe(
      headers[2]['Idempotency-Key'],
    );
    expect(headers[0]['Idempotency-Key']).not.toContain(mail.to);
    expect(headers[0]['Idempotency-Key']).not.toContain(mail.text);
  });
  it.each([403, 429, 503])(
    'no expone la respuesta privada del proveedor (%s)',
    async (status) => {
      request.mockResolvedValue(
        new Response(
          JSON.stringify({ message: key + ' ' + mail.to + ' ' + mail.text }),
          { status },
        ),
      );
      await expect(
        new ResendTransport(key, from, request).send(mail),
      ).rejects.toThrow('No se pudo entregar el correo mediante Resend.');
    },
  );
  it('no considera entregado un correo si falta la confirmación del proveedor', async () => {
    request.mockResolvedValue(new Response('{}', { status: 200 }));
    await expect(
      new ResendTransport(key, from, request).send(mail),
    ).rejects.toThrow('No se pudo entregar');
  });
  it('oculta también los errores de red', async () => {
    request.mockRejectedValue(new Error('Detalle privado: ' + key));
    await expect(
      new ResendTransport(key, from, request).send(mail),
    ).rejects.toThrow('No se pudo entregar el correo mediante Resend.');
  });
  it('valida la configuración antes de intentar enviar', () => {
    expect(() => new ResendTransport('', from, request)).toThrow(
      'RESEND_API_KEY',
    );
    expect(() => new ResendTransport(key, '', request)).toThrow('MAIL_FROM');
    expect(
      () =>
        new ResendTransport(
          key,
          'correo@example.test\r\nOtra cabecera',
          request,
        ),
    ).toThrow('MAIL_FROM');
    expect(request).not.toHaveBeenCalled();
  });
});
