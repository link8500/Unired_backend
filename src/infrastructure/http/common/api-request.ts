import { Request } from 'express';
import { Actor } from '../../../domain/common/contracts';

/** Datos añadidos por middleware/guard; el cliente no puede establecer el actor. */
export interface ApiRequest extends Request {
  actor?: Actor;
  requestId: string;
}
