import { describirDispositivo } from './dispositivo-sesion';

describe('etiqueta del dispositivo de una sesión', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0) Chrome/140.0 Safari/537.36 Edg/140.0',
      'Edge en Windows',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E Safari/604.1',
      'Safari en iPhone',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X) Version/18.0 Mobile/15E Safari/604.1',
      'Safari en iPad',
    ],
    [
      'Mozilla/5.0 (Linux; Android 12; Marca Privada) Chrome/140.0 Mobile Safari/537.36',
      'Chrome en Android',
    ],
    [
      'Mozilla/5.0 (Linux; Android 12; Marca Privada) Chrome/140.0 Safari/537.36',
      'Chrome en tablet Android',
    ],
    ['Cliente personalizado', null],
    [undefined, null],
  ])('devuelve solo navegador y plataforma para %s', (agente, label) => {
    expect(describirDispositivo(agente)).toBe(label);
  });
});
