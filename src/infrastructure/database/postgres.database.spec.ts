import { PostgresStore } from './postgres.database';
import { schema } from './schema';

describe('Adaptador de datos', () => {
  it('incluye columnas enum y todas las entidades vigentes', () => {
    expect(Object.keys(schema)).toHaveLength(43);
    expect(schema.usuarios.columns.estado).toBe('estado');
    expect(schema.archivos.columns.proposito).toBe('proposito');
    expect(schema.tutorias.columns.modalidad).toBe('modalidad');
  });
  it('normaliza la respuesta [filas, cantidad] de UPDATE', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([[{ id: '5', version_lock: 2 }], 1]);
    const store = new PostgresStore({ query });
    expect(
      await store.update('tutorias', { id: '5' }, { versionLock: 2 }),
    ).toEqual([{ id: '5', versionLock: 2 }]);
  });
  it('parametriza datos sin interpolar contenido recibido', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]?]>()
      .mockResolvedValue([]);
    const store = new PostgresStore({ query });
    const payload = "'; DROP TABLE usuarios;--";
    await store.find('usuarios', { nombre: payload });
    expect(query.mock.calls[0][0]).not.toContain(payload);
    expect(query.mock.calls[0][1]).toEqual([payload]);
  });
  it('rechaza tablas, campos y mutaciones sin filtro', async () => {
    const store = new PostgresStore({ query: jest.fn() });
    // @ts-expect-error Prueba una entrada inválida que JavaScript podría entregar.
    await expect(store.count('tabla_desconocida')).rejects.toThrow();
    await expect(
      store.find('usuarios', { campoDesconocido: 1 }),
    ).rejects.toThrow();
    await expect(
      store.update('usuarios', {}, { nombre: 'Ana' }),
    ).rejects.toThrow();
    await expect(store.remove('usuarios', {})).rejects.toThrow();
  });
  it('serializa listas JSONB como JSON, no como arrays de PostgreSQL', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([{ id: 1 }]);
    const store = new PostgresStore({ query });
    await store.insert('areas_tutoria', {
      codigo: 'test',
      requisitosDocumentales: ['certificado'],
    });
    expect(query.mock.calls[0][1][1]).toBe('["certificado"]');
  });
});
