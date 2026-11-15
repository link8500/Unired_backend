import { EntityManager } from 'typeorm';
import { AdminQueries } from './admin.queries';

function fixture() {
  const query = jest
    .fn<Promise<Record<string, unknown>[]>, [string, unknown[]?]>()
    .mockImplementation((sql) =>
      Promise.resolve(
        sql.startsWith('SELECT COUNT(*)')
          ? [{ total: 1 }]
          : [{ id: 2, nombre: 'Ana', tutor_verificado: true }],
      ),
    );
  return {
    query,
    adapter: new AdminQueries({ query } as unknown as EntityManager),
  };
}

describe('Proyecciones administrativas', () => {
  it('no lee eventos de auditoría para el resumen del dashboard', async () => {
    const { query, adapter } = fixture();
    const result = await adapter.dashboardExtras();
    expect(result).not.toHaveProperty('actividadReciente');
    expect(
      query.mock.calls.every(([sql]) => !sql.includes('eventos_auditoria')),
    ).toBe(true);
  });
  it('parametriza búsqueda, estado y rol y pagina sin interpolar datos', async () => {
    const { query, adapter } = fixture();
    const payload = "'; DROP TABLE usuarios;--";
    const page = await adapter.users({
      page: 2,
      limit: 10,
      q: payload,
      estado: 'activo',
      rol: 'moderador',
      sort: 'nombre',
    });
    expect(query.mock.calls[0][0]).not.toContain(payload);
    expect(query.mock.calls[0][0]).toContain('u.email ILIKE');
    expect(query.mock.calls[0][0]).toContain('ORDER BY u.nombre ASC,u.id DESC');
    expect(query.mock.calls[0][1]).toEqual([
      `%${payload}%`,
      'activo',
      'moderador',
      10,
      10,
    ]);
    expect(page.items[0]).toMatchObject({ tutorVerificado: true });
    expect(page.total).toBe(1);
  });
  it('no consulta credenciales, tokens ni contraseñas en el directorio', async () => {
    const { query, adapter } = fixture();
    await adapter.users({ page: 1, limit: 20 });
    expect(query.mock.calls[0][0]).not.toMatch(
      /credenciales_usuario|password_hash|refresh_token|tokens_cuenta/,
    );
  });
  it('la condición tutor exige una habilitación vigente, no un rol inventado', async () => {
    const { query, adapter } = fixture();
    await adapter.users({ page: 1, limit: 20, rol: 'tutor' });
    expect(query.mock.calls[0][0]).toContain('habilitaciones_tutor');
    expect(query.mock.calls[0][0]).toContain('valida_hasta>CURRENT_TIMESTAMP');
    expect(query.mock.calls[0][1]).toEqual([20, 0]);
  });
  it('acota los recursos de una ficha al propietario y nunca lee mensajes', async () => {
    const { query, adapter } = fixture();
    await adapter.userSummary(2);
    for (const [sql, values] of query.mock.calls) {
      expect(values).toEqual([2]);
      expect(sql).not.toMatch(/FROM mensajes|refresh_token_hash|password_hash/);
    }
  });
  it('separa los campos y filtros de tutorías y anuncios', async () => {
    const { query, adapter } = fixture();
    await adapter.publications('listings', {
      page: 1,
      limit: 20,
      propietarioId: 2,
      estado: 'publicado',
    });
    expect(query.mock.calls[0][0]).toContain('JOIN categorias_market');
    expect(query.mock.calls[0][0]).toContain('t.vendedor_id=$2');
    expect(query.mock.calls[0][1]).toEqual(['publicado', 2, 20, 0]);
  });
});
