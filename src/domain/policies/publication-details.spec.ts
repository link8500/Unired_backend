import {
  applicationDetails,
  courseDetails,
  listingDetails,
} from './publication-details';

describe('Datos de autoría de publicaciones', () => {
  it('mantiene PATCH parcial y normaliza listas sin duplicados', () => {
    expect(courseDetails({})).toEqual({});
    expect(
      courseDetails({
        objetivos: [' Aprender Dart ', 'Aprender Dart'],
        resumen: '',
        idioma: 'Inglés',
        duracionEstimadaMinutos: 120,
      }),
    ).toEqual({
      objetivos: ['Aprender Dart'],
      resumen: null,
    });
  });
  it.each([
    { objetivos: 'texto' },
    { requisitos: [null] },
    { objetivos: Array(21).fill('Meta') },
  ])('rechaza contenido de curso inválido %j', (body) =>
    expect(() => courseDetails(body)).toThrow(),
  );
  it('valida opciones cerradas de entrega y límites de descripción', () => {
    expect(
      listingDetails({
        marca: ' A ',
        formasEntrega: ['retiro', 'envio_nacional'],
      }),
    ).toEqual({ marca: 'A', formasEntrega: ['retiro', 'envio_nacional'] });
    expect(() => listingDetails({ formasEntrega: ['otro'] })).toThrow();
    expect(() =>
      listingDetails({ detalleEntrega: 'x'.repeat(1501) }),
    ).toThrow();
  });
  it('no confunde formación del solicitante con documentos o autorización', () => {
    expect(
      applicationDetails({
        formacionAcademica: null,
        experienciaDocente: ' Enseñanza ',
        especialidades: ['Matemática'],
      }),
    ).toEqual({
      formacionAcademica: null,
      experienciaDocente: 'Enseñanza',
      especialidades: ['Matemática'],
    });
    expect(() => applicationDetails({ especialidades: [123] })).toThrow();
  });
});
