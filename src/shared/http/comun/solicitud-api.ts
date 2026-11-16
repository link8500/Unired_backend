// Archivo: src/shared/http/comun/solicitud-api.ts
// Define la solicitud HTTP ampliada con identidad, permisos y datos internos de seguimiento.

import { Request } from 'express';
import { Actor } from '../../../core/dominio/comun/contratos';

/** Datos añadidos por middleware/guard; el cliente no puede establecer el actor. */
export interface SolicitudApi extends Request {
  actor?: Actor;
  requestId: string;
}
