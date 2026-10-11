import { Row } from '../../../domain/common/contracts';

/** Las direcciones HTTP se construyen afuera, no dentro de los casos de uso. */
export function presentFile(file: Row): Row {
  return {
    ...file,
    contentUrl: '/api/v1/files/' + String(file.id) + '/content',
    ...(String(file.mimeDetectado).startsWith('image/')
      ? { thumbnailUrl: '/api/v1/files/' + String(file.id) + '/thumbnail' }
      : {}),
  };
}
