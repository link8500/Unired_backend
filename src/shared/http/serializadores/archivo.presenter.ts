// Archivo: src/shared/http/serializadores/archivo.presenter.ts
// Publica únicamente los metadatos de archivo permitidos y oculta claves internas de almacenamiento.

import { Registro } from '../../../core/dominio/comun/contratos';

/** Las direcciones HTTP se construyen afuera, no dentro de los casos de uso. */
export function presentFile(file: Registro): Registro {
  return {
    ...file,
    contentUrl: '/api/v1/files/' + String(file.id) + '/content',
    ...(String(file.mimeDetectado).startsWith('image/')
      ? { thumbnailUrl: '/api/v1/files/' + String(file.id) + '/thumbnail' }
      : {}),
  };
}
