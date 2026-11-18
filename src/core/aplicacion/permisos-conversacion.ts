// Archivo: src/core/aplicacion/permisos-conversacion.ts
// Regla común para abrir chats, leer su historial y autorizar sus adjuntos.
import { Transaccion } from '../dominio/comun/contratos';
import { Conversaciones } from '../dominio/comun/entidades';
import { ensure } from '../dominio/comun/errores';
import { validGrant } from '../dominio/politicas/acceso';

export async function validarInscripcionActiva(
  tx: Transaccion,
  studentId: number,
  courseId: string,
) {
  const course = await tx.queries.publicCourse(courseId);
  ensure(course, 'Tutoría no disponible.', 403);
  const enrollment = await tx.store.one('inscripciones_tutoria', {
    tutoriaId: course.id,
    alumnoId: studentId,
  });
  ensure(
    enrollment?.estado === 'activa',
    'El tutor debe aceptar tu solicitud para habilitar la conversación.',
    403,
  );
  return enrollment;
}
export async function validarContextoConversacion(
  tx: Transaccion,
  conversation: Conversaciones,
): Promise<void> {
  ensure(
    conversation.estado === 'abierta',
    'La interacción finalizó. Puedes consultar el perfil del otro participante.',
    403,
  );
  if (conversation.tipo === 'market') {
    const listing = await tx.queries.publicListing(conversation.anuncioId!);
    ensure(
      listing && ['publicado', 'reservado'].includes(String(listing.estado)),
      'El anuncio ya no está disponible.',
      403,
    );
  } else if (conversation.solicitudApoyoId) {
    const request = await tx.store.one('solicitudes_apoyo', {
      id: conversation.solicitudApoyoId,
      estado: 'aceptada',
      alumnoId: conversation.consultanteId,
      tutorId: conversation.propietarioId,
    });
    ensure(request, 'La solicitud de tutoría ya no está activa.', 403);
    const grant = await tx.store.one('habilitaciones_tutor', {
      tutorId: conversation.propietarioId,
      areaId: request.areaId,
    });
    ensure(
      validGrant(grant, conversation.propietarioId, request.areaId),
      'La acreditación del tutor ya no está vigente.',
      403,
    );
  } else
    await validarInscripcionActiva(
      tx,
      conversation.consultanteId,
      conversation.tutoriaId!,
    );
}
