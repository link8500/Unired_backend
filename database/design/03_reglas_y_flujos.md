# Reglas y flujos del backend

Este documento conserva el contrato de diseño y sus criterios de aceptación.
La API REST y autorización están implementadas; el inventario real y las diferencias
con este diseño están en [API_UNIRED.md](../../API_UNIRED.md).
Los avisos usan SSE, no WebSockets; video es lectura HTTP autorizada, no HLS.
No hay pagos, videoconferencia alojada ni acceso administrativo global a notas/progreso.

## 1. Permisos de la plataforma

Roles propuestos: `usuario`, `revisor_tutores`, `moderador`, `administrador`.
La habilitación para impartir un área se obtiene por revisión, no por asignar
un rol `tutor` desde un formulario.

| Acción | Usuario | Tutor habilitado | Revisor / moderador | Administrador |
| --- | --- | --- | --- | --- |
| Editar perfil | El propio | El propio | El propio | El propio |
| Crear anuncios/novedades | Propios | Propios | Como usuario propio | Como usuario propio |
| Ocultar un anuncio ajeno | No | No | Moderador, con motivo | Con motivo |
| Subir acreditación | Expediente propio | Expediente propio | No sustituye documentos del tutor | No sustituye documentos del tutor |
| Leer acreditaciones | Las propias | Las propias | Revisor autorizado/asignado | Acceso autorizado/auditado |
| Decidir acreditación | No | No | Revisor; nunca la propia | Nunca la propia |
| Crear borrador de curso | Propio, aún no publicable | Propio | No como otro tutor | No como otro tutor |
| Publicar curso | No sin permiso vigente | Área habilitada propia | No por el mero rol | No por el mero rol |
| Leer progreso | El propio | Alumnos de sus cursos | No por ser moderador | Solo soporte autorizado/auditado |
| Leer chat | Participante | Participante | Mensaje denunciado necesario para revisión | No lectura global automática |
| Leer nota privada del tutor | No | Su propia nota | No | Solo soporte autorizado/auditado |

El servidor obtiene actor/roles de la sesión. No confía en `usuario_id`,
`tutor_id`, `vendedor_id`, `revisor_id` ni estados privilegiados enviados por
el cliente. Las consultas se parametrizan. Cuenta suspendida no publica ni envía
mensajes. El permiso se revisa también en WebSockets y descargas, no solo al
abrir la pantalla.

## 2. Solicitud del tutor

```text
borrador -> enviada -> en_revision -> aprobada
                                  -> rechazada
                                  -> correcciones -> nuevo envío -> enviada
borrador/enviada/correcciones -> retirada
```

- El tutor prepara datos y archivos de un área.
- Solo archivos de su propiedad, propósito evidencia, listos y escaneados.
- Un envío debe incluir los tipos obligatorios que defina la política de esa área.
  Todavía no fijamos documentos obligatorios o un número arbitrario.
- Enviar fija un conjunto de versiones en `envio_documentos`; esas versiones y
  objetos de storage no se editan ni se sobrescriben.
- Corregir añade una versión; no elimina el material del envío anterior.
- Solo una solicitud abierta por tutor/área. El índice único parcial
  protege también contra dos solicitudes simultáneas.
- Un revisor no evalúa su propia solicitud ni decide sobre un envío antiguo
  mientras haya un nuevo envío pendiente.
- El resultado debe explicar el motivo al tutor. Información interna de revisión
  no se envía indiscriminadamente a otros usuarios.

### Transacción de decisión

1. Comprobar permiso del actor y que no sea el tutor.
2. Bloquear la solicitud actual y comprobar `version_lock`, envío más reciente
   y estado `en_revision`.
3. Insertar una sola decisión de ese envío.
4. Si aprueba, insertar/actualizar la habilitación del mismo tutor y área,
   enlazada a esa solicitud y revisión.
5. Actualizar la solicitud y su versión.
6. Insertar auditoría y notificación del tutor en la misma transacción.
7. Confirmar y publicar el aviso en tiempo real; el registro persistido es la
   fuente de verdad si falla WebSocket.

La vigencia no se calcula con un `CHECK NOW()`: se evalúa con el reloj del servidor
al publicar, inscribir, reproducir contenido protegido o impartir sesiones.
Renovar autorización crea nueva evidencia/revisión y conserva la historia anterior.

## 3. Suspensión y revocación

Suspender/revocar requiere revisor/administrador, motivo y auditoría. La
habilitación se comprueba en catálogo y nuevas acciones para que el acceso no
dependa solo de actualizar el estado del curso en una tarea posterior.

Propuesta inicial: impedir nuevas publicaciones, inscripciones y enseñanza en
vivo; detener el acceso nuevo a material protegido mientras se revisa el caso.
El alumno conserva historial de inscripción/progreso y avisos de soporte.

**Pendiente de tu decisión:** cómo conservar el acceso a material ya adquirido,
si existen cursos de pago, y cómo gestionar una suspensión temporal frente a un
problema definitivo. No se implementan cancelaciones, reintegros ni plazos legales
sin definir esa política.

## 4. Publicación de cursos

```text
borrador -> publicada <-> pausada -> archivada
                    -> bloqueada (moderación)
```

Para publicar:

- el actor es propietario del curso y tiene cuenta activa;
- la habilitación está aprobada, vigente, dentro de su fecha y de la misma área;
- los datos principales y currículo están completos;
- videos, portadas y recursos son de su propiedad y tienen el propósito adecuado;
- los archivos están limpios y los videos procesados;
- un curso grabado tiene al menos una lección publicada con contenido válido;
- uno en vivo tiene sesión programada; uno mixto satisface ambos requisitos.

El tutor no cambia propietario ni área para evitar una verificación pendiente.
Un cambio de área exige una habilitación correspondiente. La transacción comprueba
la habilitación al guardar, no con un estado guardado en Flutter.

Publicar una lección nueva no activa automáticamente una inscripción de pago.
El material de acreditación nunca se reutiliza como recurso del curso, aunque su
archivo pertenezca al mismo tutor.

## 5. Inscripción, progreso y seguimiento

```text
solicitada -> activa -> completada
           -> cancelada
activa/completada -> revocada
```

- Una inscripción por alumno/curso. Reactivar reutiliza el registro y conserva
  progreso conforme a la política, no crea conteos duplicados.
- El alumno no se activa a sí mismo enviando `estado: activa`.
- MVP: curso gratuito activado tras comprobaciones o alta manual autorizada.
  Cursos cobrados y pagos requieren un flujo posterior específico.
- El servidor comprueba inscripción activa/completada y curso autorizado antes
  de conceder acceso. Las URLs temporales no aparecen en las respuestas públicas.
- Actualizar progreso comprueba actor = alumno, relación curso/lección y
  posición válida respecto a la duración. Usa upsert de la clave inscripción/lección.
- Completar lecciones no demuestra evaluación académica; no hay certificado
  oficial ni diploma generado en esta etapa.
- El tutor ve únicamente alumnos vinculados a sus cursos.
- Seguimiento `solo_tutor` nunca se incluye en la respuesta para el alumno.
- Preguntas/respuestas son del curso: tutor propietario o alumnos con acceso.
  Moderación de una pregunta no concede acceso a sus archivos privados.
- Una reseña exige inscripción elegible; no se aceptan valoraciones de visitantes
  o del tutor sobre su propio curso.

Archivar una lección no elimina progreso antiguo. La consulta de avance cuenta
solo el currículum publicado/no archivado. Cambiar un video conserva el ID lógico,
pero la política de reinicio de avance se definirá antes de emitir certificados.

## 6. Clases en vivo

- Inicio/fin UTC, duración positiva y capacidad mayor que cero.
- Reserva requiere inscripción activa del mismo curso y sesión programada.
- No se reserva dos veces la misma sesión.
- Bloquear la fila de sesión, contar reservas activas y confirmar dentro de la
  misma transacción: un `COUNT` previo sin bloqueo no evita sobreventa de aforo.
- Cancelar libera aforo, registra motivo mediante auditoría/aviso y no borra
  reservas anteriores.
- Enlace de reunión visible solo al tutor y participantes con acceso; no se
  devuelve en el catálogo.
- Asistencia se registra de forma autorizada; una marca del cliente no prueba
  automáticamente que asistió.
- Videoconferencia y streaming no están implementados por guardar una URL.

## 7. Publicaciones del marketplace

```text
borrador -> publicado <-> reservado -> vendido
        -> archivado
publicado/reservado -> archivado
cualquier anuncio -> bloqueado (moderación)
```

El usuario es vendedor de sus anuncios. El admin puede moderar un anuncio ajeno,
no publicarlo en su nombre por defecto. Restaurar un bloqueo requiere decisión
de moderación; no basta que el vendedor envíe otro estado.

Novedades, imágenes y cambios corresponden al mismo vendedor. Una actualización
de precio/estado puede publicar un aviso, pero no debería exponer datos de la
conversación o direcciones privadas.

Precio:

- fijo/negociable: importe positivo y descuento 0–90%;
- gratis: precio cero y sin descuento;
- a consultar: precio NULL y sin descuento;
- los importes se calculan con precisión decimal y su moneda.

Marcar vendido es declaración del propietario. El modelo no considera esa marca
una compra pagada y verificada por UniRed. Se conserva el anuncio/chat para
historial según política; no hay tabla de carrito o pedidos.

## 8. Chat

### Abrir conversación desde un anuncio

1. Cuenta autenticada y activa.
2. Anuncio público con propietario activo; interesado diferente al vendedor.
3. Comprobar bloqueo en ambos sentidos.
4. Resolver vendedor a partir del anuncio, nunca del destinatario enviado por el cliente.
5. Buscar/crear conversación con la clave única anuncio + interesado.
6. Crear exactamente dos participantes en una transacción. Si dos solicitudes
   compiten, resolver el conflicto único devolviendo el mismo chat existente.

### Enviar/recibir

- El autor es la sesión, participante vigente y uno de los dos interesados.
- El chat está habilitado y no existe bloqueo que impida contacto.
- Adjunto propio, propósito chat, listo/limpio; nunca evidencia de acreditación.
- Reintento del mismo `cliente_id` y mismo contenido devuelve el mensaje existente.
  Mismo identificador con distinto contenido produce conflicto.
- Mensaje y actualización de última actividad/aviso se guardan en transacción.
- WebSocket no acepta que un usuario se suscriba a otra conversación por conocer su ID.
- La lectura del historial requiere participación. Un bloqueo detiene nuevos
  mensajes; la consulta del historial previo no abre contacto de nuevo.
- El cursor leído avanza, nunca apunta a un mensaje de otro chat ni retrocede.
- El borrado lógico oculta contenido/adjunto en respuestas normales; no se
  devuelve el texto eliminado para que Flutter simplemente lo esconda.
- Eliminar/archivar para una persona no destruye mensajes de la otra.
- Límites de mensajes, adjuntos y carga configurables; aplicar rate limits.

En contexto curso, alumno con inscripción autorizada y tutor del curso. No se
incorporan grupos, contactos generales ni lectura administrativa global automática.

## 9. Archivos privados y videos

1. Registrar intención de carga con actor, propósito y cuota.
2. Generar key no predecible, sin usar el nombre original como ruta.
3. Guardar objeto privado y validar tamaño/formato real/escaneo.
4. Procesar videos y marcar disponibilidad solo si terminó.
5. Vincular a expediente, lección, anuncio o mensaje tras comprobar propietario,
   propósito y permisos.
6. Al descargar, volver a comprobar acceso al recurso y emitir autorización temporal.
7. Objetos inmutables/versionados para evidencias; limpieza de huérfanos mediante
   proceso controlado, no un borrado genérico en cascada.

El estado `listo` es un requisito técnico, no permiso para hacerlo público.
Claves de storage, hashes de tokens y datos de acreditación no se publican en APIs
de catálogo. No se envían documentos privados a servicios externos de análisis
sin una decisión de privacidad explícita.

## 10. Áreas de la API implementada

| Área | Ejemplos |
| --- | --- |
| Cuenta | `GET/PATCH /me`, acceso y sesiones |
| Expediente | `POST /me/tutor-applications`, documentos, enviar versión |
| Revisión | `GET /admin/tutor-applications`, decisión por envío y versión |
| Cursos | `GET /courses`, `POST /me/courses`, currículo, publicar |
| Aprendizaje | `GET /me/enrollments`, progreso por lección, preguntas |
| Seguimiento | `GET /me/courses/:id/students`, comentarios de seguimiento |
| En vivo | sesiones del curso, reservar/cancelar, asistencia |
| Marketplace | `GET /listings`, `POST /me/listings`, novedades, favoritos |
| Chat | `POST /listings/:id/conversations`, mensajes y lectura |
| Moderación | denuncias, bloqueos, decisiones y auditoría |

DTOs independientes por acción. No usar el CRUD genérico de usuarios para cambiar
roles, verificación, propietario o permisos. Guard/Policy por recurso, no solamente
ocultar botones en Flutter.

## 11. Pruebas de aceptación antes de conectar Flutter

1. Usuario no habilitado: borrador sí, publicar curso no.
2. Aprobado en un área: no puede usar otra ni la habilitación de otro tutor.
3. Tutor no revisa su propio expediente; una revisión antigua no aprueba un envío nuevo.
4. Reintentar aprobación no duplica decisión/habilitación/notificación.
5. Cambiar archivo del envío revisado no modifica la evidencia original.
6. Dos solicitudes simultáneas no crean dos expedientes abiertos del mismo área.
7. Revisor sin permiso no descarga documentos; URL vencida no concede acceso.
8. Habilitación revocada/vencida no permite nueva enseñanza ni publicar.
9. No se inscribe/completa ni descarga como otro alumno.
10. Progreso y recursos no se vinculan a lecciones de otro curso.
11. Tutor no lee el progreso de alumnos de otro tutor; alumno no lee notas privadas.
12. Dos reservas simultáneas para el último cupo solo confirman una.
13. Usuario no edita anuncios/novedades ajenos ni restaura un bloqueo.
14. Precio gratis NULL, descuento fuera de rango y precio negativo se rechazan.
15. El precio de un anuncio no crea un pedido ni un cobro.
16. Dos aperturas simultáneas del chat devuelven la misma conversación.
17. No se agregan terceros al chat; conocer ID no permite leer ni suscribirse.
18. Reintento de mensaje no duplica contenido; nonce reutilizado con otro texto falla.
19. Adjunto con propósito acreditación no se comparte por chat o curso.
20. Cursor de lectura de otro chat se rechaza.
21. Bloqueo detiene contactos/mensajes, no borra el historial de la otra persona.
22. Notificación/auditoría no incluye contraseña, token secreto o documentos completos.
23. Rol/estado privilegiado en el body se ignora/rechaza.
24. Eliminación lógica de mensaje no expone texto/archivo en respuestas normales.

Estas pruebas necesitan una instancia aislada de PostgreSQL y pruebas de integración.
El verificador offline solo cubre estructura, no estas reglas de aplicación.
## 12. Implementación de infraestructura multimedia

PostgreSQL corre en Docker y NestJS localmente. La carga HTTP autenticada detecta
el formato real, aplica antivirus, genera miniaturas de imágenes y valida video
con ffprobe. Los archivos se conservan en una carpeta privada local y la API
sirve contenido por permisos y segmentos. No hay transcodificación/HLS.

`BinaryStorage` permite sustituir el proveedor físico; no se implementó un servicio
externo ni una purga programada. Las reglas de retención requieren una política
antes de producción. El borrado lógico conserva objetos y cuota física.
