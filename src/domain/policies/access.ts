import { Actor, Row } from '../common/contracts';
import { ensure, forbidden } from '../common/errors';

export function active(actor: Actor): void {
  ensure(
    actor.estado === 'activo',
    'Verifica tu correo y mantén la cuenta activa para continuar.',
    403,
    'ACCOUNT_NOT_ACTIVE',
  );
}
export function role(actor: Actor, ...roles: string[]): void {
  if (!actor.roles.some((value) => roles.includes(value))) forbidden();
}
export function own(actor: Actor, owner: unknown): void {
  if (Number(owner) !== actor.id)
    forbidden('El recurso pertenece a otro usuario.');
}
export function validGrant(
  grant:
    | {
        tutorId: number;
        areaId: unknown;
        estado: string;
        validaDesde: Date | string;
        validaHasta: Date | string | null;
      }
    | undefined
    | null
    | '',
  tutorId: number,
  areaId: unknown,
  now = new Date(),
): boolean {
  return (
    !!grant &&
    grant.tutorId === tutorId &&
    String(grant.areaId) === String(areaId) &&
    grant.estado === 'vigente' &&
    new Date(grant.validaDesde) <= now &&
    (!grant.validaHasta || new Date(grant.validaHasta) > now)
  );
}
export function readyFile(file: Row | undefined): boolean {
  return (
    !!file &&
    !file.eliminadoEn &&
    file.estado === 'listo' &&
    file.escaneo === 'limpio' &&
    (!String(file.mimeDetectado).startsWith('video/') ||
      file.procesamiento === 'listo')
  );
}
