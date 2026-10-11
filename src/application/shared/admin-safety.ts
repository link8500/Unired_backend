import { Transaction } from '../../domain/common/contracts';
import { ensure } from '../../domain/common/errors';

/** Un mismo bloqueo serializa cambios de rol, suspensión y baja voluntaria. */
export async function preserveAdministrator(
  tx: Transaction,
  userId: number,
): Promise<void> {
  await tx.store.one('roles', { codigo: 'administrador' }, { lock: true });
  const assignment = await tx.store.one('usuario_roles', {
    usuarioId: userId,
    rolCodigo: 'administrador',
  });
  const user = await tx.store.one('usuarios', { id: userId });
  if (!assignment || !user || user.estado !== 'activo' || user.eliminadoEn)
    return;
  const assignments = await tx.store.find('usuario_roles', {
    rolCodigo: 'administrador',
  });
  const count = await tx.store.count('usuarios', {
    id: { op: 'in', value: assignments.map((row) => row.usuarioId) },
    estado: 'activo',
    eliminadoEn: null,
  });
  ensure(count > 1, 'No puedes retirar al último administrador activo.', 409);
}
