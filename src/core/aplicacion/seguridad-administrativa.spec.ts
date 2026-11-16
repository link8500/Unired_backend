// Archivo: src/core/aplicacion/seguridad-administrativa.spec.ts
// Pruebas automatizadas del componente seguridad-administrativa y sus condiciones de error.

import { preserveAdministrator } from './seguridad-administrativa';
import { Transaccion } from '../dominio/comun/contratos';

function transaction(count: number): Transaccion {
  return {
    store: {
      one: jest.fn((entity: string) =>
        Promise.resolve(
          entity === 'usuarios'
            ? { id: 1, estado: 'activo', eliminadoEn: null }
            : { rolCodigo: 'administrador' },
        ),
      ),
      find: jest.fn(() =>
        Promise.resolve([{ usuarioId: 1 }, { usuarioId: 2 }]),
      ),
      count: jest.fn(() => Promise.resolve(count)),
    },
    queries: {},
  } as unknown as Transaccion;
}
describe('Protección administrativa reutilizada', () => {
  it('impide retirar al último administrador activo', async () => {
    await expect(preserveAdministrator(transaction(1), 1)).rejects.toThrow();
  });
  it('permite la baja cuando queda otro administrador activo', async () => {
    await expect(
      preserveAdministrator(transaction(2), 1),
    ).resolves.toBeUndefined();
  });
});
