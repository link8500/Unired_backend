// Fixtures sintéticos: los correos .test y los documentos no representan personas reales.
const people = [
  {
    key: 'admin',
    name: 'Administración UniRed',
    email: 'admin@demo.unired.test',
    role: 'administrador',
    city: 'Managua',
    bio: 'Cuenta de demostración para gestionar la comunidad, los catálogos y los permisos.',
    works: true,
    occupation: 'Administración de la comunidad',
    color: '#0875C9',
  },
  {
    key: 'reviewer',
    name: 'Lucía Mendoza',
    email: 'revision@demo.unired.test',
    role: 'revisor_tutores',
    city: 'León',
    bio: 'Perfil de muestra para revisar expedientes y acompañar la acreditación de tutores.',
    works: true,
    occupation: 'Revisión académica',
    color: '#188267',
  },
  {
    key: 'moderator',
    name: 'Gabriel Ruiz',
    email: 'moderacion@demo.unired.test',
    role: 'moderador',
    city: 'Managua',
    bio: 'Perfil de muestra para atender consultas y revisar publicaciones de la comunidad.',
    works: true,
    occupation: 'Moderación',
    color: '#7C5DAD',
  },
  {
    key: 'web',
    name: 'Daniela Rivas',
    email: 'daniela@demo.unired.test',
    area: 'programacion',
    city: 'Managua',
    major: 'Ingeniería en Sistemas',
    bio: 'Me gusta enseñar programación con ejemplos pequeños y proyectos que puedes terminar. Perfil de demostración.',
    works: true,
    occupation: 'Desarrolladora web',
    color: '#146B8C',
  },
  {
    key: 'math',
    name: 'Andrés López',
    email: 'andres@demo.unired.test',
    area: 'matematicas',
    city: 'León',
    major: 'Matemática Aplicada',
    bio: 'Explico matemáticas paso a paso, con ejercicios y seguimiento de tus dudas. Perfil de demostración.',
    works: true,
    occupation: 'Docente de matemáticas',
    color: '#B6684D',
  },
  {
    key: 'english',
    name: 'Valeria Cruz',
    email: 'valeria@demo.unired.test',
    area: 'idiomas',
    city: 'Granada',
    major: 'Inglés',
    bio: 'Practiquemos inglés con situaciones cotidianas y metas concretas. Perfil de demostración.',
    works: true,
    occupation: 'Tutora de idiomas',
    color: '#618552',
  },
  {
    key: 'design',
    name: 'Mateo Flores',
    email: 'mateo@demo.unired.test',
    area: 'diseno',
    city: 'Masaya',
    major: 'Diseño Gráfico',
    bio: 'Aprende a convertir ideas en interfaces claras y accesibles. Perfil de demostración.',
    works: true,
    occupation: 'Diseñador de interfaces',
    color: '#795AAC',
  },
  {
    key: 'student',
    name: 'Sofía Martínez',
    email: 'sofia@demo.unired.test',
    city: 'Managua',
    major: 'Ingeniería en Sistemas',
    bio: 'Estoy aprendiendo desarrollo web y comparto materiales de estudio. Me interesan la tecnología y el diseño. Perfil de demostración.',
    works: false,
    color: '#D36A76',
  },
  {
    key: 'student2',
    name: 'Diego Hernández',
    email: 'diego@demo.unired.test',
    city: 'León',
    major: 'Ingeniería Industrial',
    bio: 'Aprendo resolviendo ejercicios y buscando recursos que pueda reutilizar. Perfil de demostración.',
    works: true,
    occupation: 'Asistente de proyectos',
    color: '#4C8AA1',
  },
  {
    key: 'student3',
    name: 'Camila Pérez',
    email: 'camila@demo.unired.test',
    city: 'Granada',
    major: 'Administración de Empresas',
    bio: 'Busco mejorar mi inglés y darle una segunda vida a mis libros. Perfil de demostración.',
    works: false,
    color: '#B78A4E',
  },
  {
    key: 'student4',
    name: 'Sebastián Torres',
    email: 'sebastian@demo.unired.test',
    city: 'Masaya',
    major: 'Arquitectura',
    bio: 'Me gustan el dibujo, el diseño y los proyectos en equipo. Perfil de demostración.',
    works: false,
    color: '#7A78AE',
  },
];
const courses = [
  [
    'web',
    'Desarrollo web desde cero',
    'HTML Y CSS',
    '#184F6B',
    'mixta',
    'publicada',
    450,
  ],
  [
    'math',
    'Cálculo sin complicaciones',
    'MATEMÁTICAS',
    '#A25C4D',
    'mixta',
    'publicada',
    350,
  ],
  [
    'english',
    'Inglés para conversaciones reales',
    'INGLÉS PRÁCTICO',
    '#4F7254',
    'mixta',
    'publicada',
    500,
  ],
  [
    'design',
    'Diseña tu primera interfaz',
    'DISEÑO UX UI',
    '#6D5694',
    'grabada',
    'publicada',
    400,
  ],
  [
    'web',
    'JavaScript con proyectos pequeños',
    'JAVASCRIPT',
    '#266D84',
    'grabada',
    'publicada',
    600,
  ],
  [
    'math',
    'Álgebra lineal paso a paso',
    'ÁLGEBRA LINEAL',
    '#AA7450',
    'grabada',
    'publicada',
    300,
  ],
  [
    'english',
    'Taller de pronunciación',
    'PRONUNCIACIÓN',
    '#6B8851',
    'en_vivo',
    'pausada',
    250,
  ],
  [
    'design',
    'Prototipos y sistemas visuales',
    'PROTOTIPADO',
    '#85659B',
    'grabada',
    'borrador',
    550,
  ],
];
const listings = [
  [
    'Calculadora científica',
    'tecnologia',
    'calculator',
    '#DCEAF0',
    850,
    'publicado',
    'student',
  ],
  [
    'Introducción al cálculo',
    'libros',
    'book',
    '#F0DDD5',
    320,
    'publicado',
    'math',
  ],
  [
    'Auriculares inalámbricos',
    'tecnologia',
    'headphones',
    '#E8E1F2',
    650,
    'publicado',
    'student2',
  ],
  [
    'Kit de dibujo universitario',
    'materiales',
    'pencils',
    '#E4EBD8',
    280,
    'publicado',
    'student4',
  ],
  [
    'Mochila para todos los días',
    'accesorios',
    'bag',
    '#EADDD2',
    550,
    'publicado',
    'student3',
  ],
  [
    'Teclado mecánico compacto',
    'tecnologia',
    'keyboard',
    '#DCE4F1',
    1200,
    'publicado',
    'web',
  ],
  [
    'Álgebra lineal aplicada',
    'libros',
    'book',
    '#DEE9DF',
    290,
    'publicado',
    'student2',
  ],
  [
    'Agenda de estudio semanal',
    'materiales',
    'book',
    '#F4E4D9',
    150,
    'publicado',
    'student',
  ],
  [
    'Lámpara de escritorio',
    'accesorios',
    'lamp',
    '#E9E2D2',
    400,
    'publicado',
    'design',
  ],
  [
    'Monitor de 24 pulgadas',
    'tecnologia',
    'monitor',
    '#DDE8EC',
    3200,
    'publicado',
    'admin',
  ],
  [
    'Fundamentos de programación',
    'libros',
    'book',
    '#E2DFED',
    350,
    'publicado',
    'web',
  ],
  [
    'Set de marcadores de colores',
    'materiales',
    'pencils',
    '#EBE8D8',
    180,
    'publicado',
    'student3',
  ],
  [
    'Soporte de aluminio para laptop',
    'accesorios',
    'stand',
    '#DCE5EA',
    450,
    'vendido',
    'admin',
  ],
  [
    'Tablet para tomar apuntes',
    'tecnologia',
    'tablet',
    '#E7DFED',
    2800,
    'vendido',
    'student4',
  ],
  [
    'Organizador de escritorio',
    'accesorios',
    'pencils',
    '#E8E5DD',
    220,
    'borrador',
    'admin',
  ],
  [
    'Cuadernos universitarios',
    'materiales',
    'book',
    '#ECDDDC',
    120,
    'reservado',
    'student',
  ],
];

function escape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
function svg(body, background = '#EEF3F5', width = 960, height = 640) {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
      width +
      '" height="' +
      height +
      '" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '"><rect width="100%" height="100%" fill="' +
      background +
      '"/>' +
      body +
      '</svg>',
  );
}
function avatar(person) {
  const initials = person.name
    .split(' ')
    .map((x) => x[0])
    .slice(0, 2)
    .join('');
  return svg(
    '<circle cx="160" cy="160" r="140" fill="' +
      person.color +
      '"/><text x="160" y="195" text-anchor="middle" font-size="100" font-family="Arial" font-weight="700" fill="white">' +
      initials +
      '</text>',
    '#F5F7FA',
    320,
    320,
  );
}
function cover(label, color, subtitle = 'APRENDE · PRACTICA · COMPARTE') {
  return svg(
    '<circle cx="790" cy="170" r="210" fill="white" opacity=".06"/><circle cx="840" cy="470" r="250" fill="white" opacity=".05"/><path d="M690 300l-60 70 60 70m95-140l60 70-60 70" fill="none" stroke="white" stroke-width="14" opacity=".5"/><text x="65" y="85" font-family="Arial" font-size="22" letter-spacing="4" fill="white" opacity=".7">UNIRED · DEMOSTRACIÓN</text><text x="65" y="300" font-family="Arial" font-size="51" font-weight="700" fill="white">' +
      escape(label) +
      '</text><rect x="65" y="350" width="85" height="6" rx="3" fill="#F3A1A8"/><text x="65" y="410" font-family="Arial" font-size="21" fill="white" opacity=".8">' +
      escape(subtitle) +
      '</text>',
    color,
  );
}
const shapes = {
  calculator:
    '<rect x="355" y="90" width="250" height="390" rx="28" fill="#31414D"/><rect x="380" y="122" width="200" height="75" rx="10" fill="#BFCFB7"/><text x="554" y="172" text-anchor="end" font-family="Arial" font-size="35" fill="#30433B">123.45</text>' +
    Array.from(
      { length: 24 },
      (_, i) =>
        '<rect x="' +
        (380 + (i % 4) * 50) +
        '" y="' +
        (225 + Math.floor(i / 4) * 37) +
        '" width="35" height="25" rx="6" fill="' +
        (i > 19 ? '#DE9679' : '#E9EDEF') +
        '"/>',
    ).join(''),
  book: '<path d="M320 125h280l45 45v330H320z" fill="#346E87"/><path d="M320 125v375h30V125" fill="#24516B"/><rect x="375" y="190" width="210" height="175" rx="4" fill="#FAF7EE"/><path d="M400 235h145m-145 30h110m-110 30h135" stroke="#A2B6B7" stroke-width="9"/><text x="480" y="420" text-anchor="middle" font-size="20" font-family="Arial" fill="white">EDICIÓN DE ESTUDIO</text>',
  headphones:
    '<path d="M335 300v-45a145 145 0 01290 0v45" fill="none" stroke="#3A4358" stroke-width="46"/><rect x="305" y="260" width="100" height="175" rx="44" fill="#535D73"/><rect x="555" y="260" width="100" height="175" rx="44" fill="#535D73"/><rect x="332" y="278" width="38" height="139" rx="19" fill="#222A3B"/><rect x="590" y="278" width="38" height="139" rx="19" fill="#222A3B"/>',
  pencils:
    '<rect x="325" y="340" width="310" height="150" rx="20" fill="#728681"/>' +
    ['#D78472', '#D7AE54', '#5B969D', '#7C729C', '#8DA36A']
      .map(
        (c, i) =>
          '<path d="M' +
          (355 + i * 52) +
          ' 350V170l15-45 15 45v180" fill="' +
          c +
          '"/><path d="M' +
          (355 + i * 52) +
          ' 170l15-45 15 45" fill="#E5CDB2"/>',
      )
      .join(''),
  bag: '<path d="M410 165v-35a70 70 0 01140 0v35" fill="none" stroke="#765443" stroke-width="18"/><rect x="325" y="140" width="310" height="350" rx="80" fill="#B48B6C"/><rect x="355" y="300" width="250" height="155" rx="30" fill="#8E6853"/><path d="M380 325h200" stroke="#D4B59A" stroke-width="8"/><rect x="450" y="208" width="60" height="35" rx="5" fill="#E1CCAC"/>',
  keyboard:
    '<g transform="translate(225 200)"><rect width="510" height="210" rx="22" fill="#495263"/>' +
    Array.from(
      { length: 48 },
      (_, i) =>
        '<rect x="' +
        (20 + (i % 12) * 39) +
        '" y="' +
        (20 + Math.floor(i / 12) * 40) +
        '" width="32" height="31" rx="5" fill="' +
        (i % 13 === 0 ? '#CA8B88' : '#CDD6DE') +
        '"/>',
    ).join('') +
    '<rect x="140" y="178" width="230" height="16" rx="5" fill="#BAC6D2"/></g>',
  lamp: '<ellipse cx="490" cy="482" rx="145" ry="22" fill="#41565D"/><path d="M490 465V330l80-160" fill="none" stroke="#41565D" stroke-width="22"/><path d="M485 155l125 50-40 115-170-70z" fill="#BD9254"/><ellipse cx="484" cy="283" rx="90" ry="18" transform="rotate(22 484 283)" fill="#F5D89A"/>',
  monitor:
    '<rect x="225" y="120" width="510" height="320" rx="16" fill="#344351"/><rect x="245" y="140" width="470" height="274" rx="3" fill="#91B3BD"/><path d="M245 340l140-100 85 60 130-115 115 90v139H245" fill="#527C91"/><path d="M475 440v55m-90 0h190" stroke="#344351" stroke-width="20"/>',
  tablet:
    '<rect x="320" y="80" width="320" height="430" rx="24" fill="#3F4C5A"/><rect x="338" y="110" width="284" height="370" rx="4" fill="#F4F0E9"/><path d="M375 175h210m-210 50h160m-160 50h195m-195 50h175m-175 50h120" stroke="#A2B8BF" stroke-width="12"/><path d="M662 125v300" stroke="#D1AB77" stroke-width="14" stroke-linecap="round"/>',
  stand:
    '<path d="M300 360l290-170 80 55-290 170z" fill="#8A9EA8"/><path d="M380 415v65h240v-35H425v-57" fill="#ADBCC3"/><path d="M325 360l270-155" stroke="#CCD6DA" stroke-width="14"/>',
};
function product(spec) {
  return svg(
    '<ellipse cx="480" cy="510" rx="235" ry="24" fill="#000" opacity=".07"/>' +
      shapes[spec[2]] +
      '<text x="45" y="588" font-family="Arial" font-size="20" letter-spacing="3" fill="#46545C">UNIRED · CATÁLOGO DE MUESTRA</text>',
    spec[3],
  );
}
function banner(color) {
  return svg(
    '<circle cx="1130" cy="30" r="240" fill="white" opacity=".08"/><circle cx="1090" cy="390" r="250" fill="white" opacity=".05"/><path d="M680 0L470 360m270-360L530 360" stroke="white" stroke-width="2" opacity=".12"/><circle cx="960" cy="160" r="90" fill="none" stroke="white" stroke-width="2" opacity=".13"/>',
    color,
    1280,
    360,
  );
}
module.exports = {
  people,
  courses,
  listings,
  avatar,
  cover,
  banner,
  product,
  svg,
};
