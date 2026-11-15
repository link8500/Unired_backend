require('dotenv/config');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const sharp = require('sharp');
const source = require('../dist/infrastructure/database/data-source').default;
const {PostgresStore} = require('../dist/infrastructure/database/postgres.database');
const {PrivateStorageAdapter} = require('../dist/infrastructure/storage/private-storage.adapter');
const oldFixture = require('./demo/fixtures.cjs');
const courseRoot = 'C:/Users/MSI THIN/Downloads/Course Universidad Angular - De Cero a Experto - Actualizado';
const pharmacyRoot = 'C:/Users/MSI THIN/Documents/Code/Flutter/farmacia_sae/images/products';
const storage = new PrivateStorageAdapter();
const manifestPath = path.join(storage.root, '_imports', 'angular-medicina.json');
const now = () => new Date();
let manifest = {files:{},courseId:null,listings:[]};
const medicines = [
  ['paracetamol','Paracetamol 500 mg','Caja de 10 tabletas',65,'Analgésicos'],
  ['ibuprofeno','Ibuprofeno 400 mg','Caja de 10 tabletas',90,'Analgésicos'],
  ['loratadina','Loratadina 10 mg','Caja de 10 tabletas',80,'Antialérgicos'],
  ['vitamina-c','Vitamina C 1 g','Tubo de 10 tabletas',120,'Vitaminas'],
  ['alcohol','Alcohol medicinal 120 ml','Frasco de 120 ml',55,'Cuidado personal'],
  ['omeprazol','Omeprazol 20 mg','Caja de 10 cápsulas',110,'Gastrointestinal'],
  ['amoxicilina','Amoxicilina 500 mg','Caja de 10 cápsulas',160,'Antibióticos'],
  ['losartan','Losartán 50 mg','Caja de 30 tabletas',145,'Cardiovascular'],
];
const clean = name => name.replace(/^\d+\s*-\s*/,'').replace(/\.(mp4|pdf|zip)$/i,'')
  .replace(/\s*\((?:PDF|Código|PDF y [Cc]ódigo|PDF y código)[^)]*\)/g,'').trim();
async function digest(file) {
  const hash=crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest();
}
async function saveManifest() {
  await fs.mkdir(path.dirname(manifestPath),{recursive:true});
  await fs.writeFile(manifestPath,JSON.stringify(manifest,null,2));
}
async function importFile(owner,purpose,filePath,name,buffer) {
  const info=buffer?{size:buffer.length,mtimeMs:0}:await fs.stat(filePath);
  const cacheKey=owner+':'+purpose+':'+(filePath||name);
  const cached=manifest.files[cacheKey];
  if (cached && cached.size===info.size && cached.mtime===info.mtimeMs) {
    const rows=await source.query('SELECT id,estado,duracion_segundos FROM archivos WHERE id=$1 AND eliminado_en IS NULL',[cached.id]);
    if (rows[0]?.estado==='listo') return {id:cached.id,duration:rows[0].duracion_segundos||0};
  }
  const ext=buffer?'webp':path.extname(filePath).slice(1).toLowerCase();
  assert(['mp4','pdf','zip','png','webp'].includes(ext));
  const key='showcase/'+crypto.randomUUID()+'.'+ext;
  const absolute=storage.absolute(key);
  await fs.mkdir(path.dirname(absolute),{recursive:true});
  if (buffer) await fs.writeFile(absolute,buffer);
  else {
    // Un enlace físico evita copiar los 2,4 GiB de videos. El original queda
    // intacto; retirar el enlace del storage no elimina el archivo descargado.
    await fs.link(filePath,absolute);
  }
  await storage.scan(key);
  let duration=null, dimensions={},thumb;
  const mime=ext==='mp4'?'video/mp4':ext==='pdf'?'application/pdf':ext==='zip'?'application/zip':ext==='png'?'image/png':'image/webp';
  if(ext==='mp4') duration=(await storage.probeVideo(key)).duration;
  if(mime.startsWith('image/')){
    dimensions=await sharp(absolute).metadata();
    thumb=await storage.thumbnail(key,'showcase/thumbnails');
  }
  const hash=await digest(absolute);
  const store=new PostgresStore(source.manager);
  const file=await store.insert('archivos',{
    propietarioId:owner,proposito:purpose,storageBucket:'private-media',proveedor:'local',
    extension:ext,storageKey:key,nombreOriginal:name,mimeDetectado:mime,tamanoBytes:String(info.size),
    sha256:hash,estado:'listo',escaneo:'limpio',procesamiento:duration?'listo':'no_aplica',
    duracionSegundos:duration,anchoPx:dimensions.width||null,altoPx:dimensions.height||null,
  });
  if(thumb) await store.insert('variantes_archivo',{
    archivoId:file.id,nombre:'thumbnail',tipo:'imagen',storageKey:thumb.key,mimeDetectado:'image/webp',
    tamanoBytes:String(thumb.bytes),anchoPx:thumb.width,altoPx:thumb.height,estado:'listo',
  });
  manifest.files[cacheKey]={id:file.id,size:info.size,mtime:info.mtimeMs};
  await saveManifest();
  return {id:file.id,duration:duration||0};
}
async function main(){
  assert(['127.0.0.1','localhost','::1'].includes(source.options.host) && source.options.database==='unired','Importación permitida solo en la base local unired.');
  assert((process.env.NODE_ENV||'development')==='development');
  await fs.access(courseRoot);await fs.access(pharmacyRoot);
  manifest=JSON.parse(await fs.readFile(manifestPath,'utf8').catch(()=>JSON.stringify(manifest)));
  await source.initialize();
  try{
    const store=new PostgresStore(source.manager);
    const tutor=await store.one('usuarios',{email:'daniela@demo.unired.test'});
    const seller=await store.one('usuarios',{email:'admin@demo.unired.test'});
    assert(tutor&&seller,'Se necesitan las cuentas locales de demostración.');
    const area=await store.one('areas_tutoria',{codigo:'programacion'});
    const grant=await store.one('habilitaciones_tutor',{tutorId:tutor.id,areaId:area.id,estado:'vigente'});
    assert(grant,'Falta la habilitación de programación.');
    const coverSvg=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="810"><defs><linearGradient id="b" x2="1" y2="1"><stop stop-color="#171423"/><stop offset="1" stop-color="#361628"/></linearGradient></defs><rect width="1440" height="810" fill="url(#b)"/><circle cx="1150" cy="180" r="360" fill="#e83250" opacity=".09"/><path d="M1070 160l190 68-30 250-160 90-160-90-30-250z" fill="#dd1748"/><text x="1070" y="441" text-anchor="middle" font-family="Arial" font-size="250" font-weight="700" fill="white">A</text><text x="100" y="125" fill="#ee9dad" font-family="Arial" font-size="23" letter-spacing="5">DESARROLLO WEB</text><text x="100" y="305" fill="white" font-family="Arial" font-size="82" font-weight="700">Universidad</text><text x="100" y="407" fill="white" font-family="Arial" font-size="95" font-weight="700">Angular</text><text x="105" y="490" fill="#ddd5e2" font-family="Arial" font-size="32">De cero a experto</text><path d="M100 550h100" stroke="#ed626b" stroke-width="7"/><text x="100" y="655" fill="#ddd5e2" font-family="Arial" font-size="26">Componentes · Servicios · Rutas · Firebase</text><text x="100" y="735" fill="#a59baa" font-family="Arial" font-size="20">BIBLIOTECA DE APRENDIZAJE · UNIRED</text></svg>');
    const coverBytes=await sharp(coverSvg).webp({quality:92}).toBuffer();
    const cover=await importFile(tutor.id,'portada_curso',null,'universidad-angular.webp',coverBytes);
    const sections=[];
    const folders=(await fs.readdir(courseRoot,{withFileTypes:true})).filter(x=>x.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
    let processed=0;
    for(const folder of folders){
      const files=(await fs.readdir(path.join(courseRoot,folder.name))).filter(n=>/\.(mp4|pdf|zip)$/i.test(n)).sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
      if(!files.length)continue;
      const lessons=new Map();
      // El prefijo de la descarga relaciona automáticamente video, PDF y código.
      for(const name of files){
        const number=Number(name.match(/^\d+/)?.[0]);if(!number)continue;
        if(!lessons.has(number)) lessons.set(number,{number,title:clean(name).split(' - ')[0],resources:[]});
        const lesson=lessons.get(number);
        const file=await importFile(tutor.id,name.endsWith('.mp4')?'video_leccion':'recurso_curso',path.join(courseRoot,folder.name,name),name);
        if(name.endsWith('.mp4')) {lesson.title=clean(name);lesson.video=file; }
        else lesson.resources.push({file,name:name.endsWith('.pdf')?'Apuntes de la lección · PDF':'Código del ejercicio · ZIP'});
        processed++;if(processed%20===0)console.log('Archivos escaneados e indexados: '+processed);
      }
      sections.push({title:clean(folder.name),lessons:[...lessons.values()].sort((a,b)=>a.number-b.number)});
    }
    const productFiles=[];
    for(const item of medicines){
      const bytes=await sharp(path.join(pharmacyRoot,item[0]+'.png')).resize(1200,1200,{fit:'inside',withoutEnlargement:true}).webp({quality:90}).toBuffer();
      productFiles.push(await importFile(seller.id,'imagen_anuncio',path.join(pharmacyRoot,item[0]+'.png'),item[0]+'.webp',bytes));
    }
    console.log('Publicando la biblioteca de Angular y el catálogo de medicina...');
    await source.transaction(async manager=>{
      const tx=new PostgresStore(manager);
      // Retiramos solo las publicaciones ficticias anteriores. Las cuentas y
      // cualquier publicación nueva del usuario permanecen intactas.
      for(const spec of oldFixture.courses){
        await manager.query("UPDATE tutorias SET estado='pausada' WHERE titulo=$1 AND tutor_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.unired.test') AND estado='publicada'",[spec[1]]);
      }
      for(const spec of oldFixture.listings){
        await manager.query("UPDATE anuncios_market SET estado='archivado' WHERE titulo=$1 AND vendedor_id IN (SELECT id FROM usuarios WHERE email LIKE '%@demo.unired.test') AND eliminado_en IS NULL",[spec[0]]);
      }
      const values={
        tutorId:tutor.id,areaId:area.id,habilitacionId:grant.id,
        titulo:'Universidad Angular · De cero a experto',
        resumen:'Construye aplicaciones reales con componentes, servicios, rutas y Firebase. Una ruta de aprendizaje organizada, con videos, apuntes y proyectos para practicar.',
        descripcion:'Aprende Angular paso a paso: prepara tu entorno, crea componentes y conecta los datos de tus aplicaciones. Pondrás en práctica lo aprendido en una tienda en línea, una calculadora y una aplicación de presupuesto.\n\nEsta edición local reúne las secciones disponibles de «Universidad Angular - De Cero a Experto - Actualizado», descargadas por el propietario desde Udemy. Incluye únicamente los archivos presentes; no se presenta como el curso completo ni como contenido creado por UniRed.',
        nivel:'inicial',modalidad:'grabada',estado:'publicada',precioBase:0,moneda:'NIO',
        portadaArchivoId:cover.id,publicadaEn:now(),idioma:'Español',
        objetivos:['Crear aplicaciones con componentes reutilizables','Dominar el flujo de datos y las directivas','Organizar la lógica con servicios e inyección de dependencias','Configurar navegación y rutas hijas','Consumir datos desde Firebase y HTTP','Construir una tienda en línea y una app de presupuesto'],
        requisitos:['Conocimientos básicos de HTML, CSS y JavaScript','Un equipo con Node.js y Visual Studio Code','Disposición para practicar con los ejercicios'],
        dirigidoA:'Estudiantes y desarrolladores que quieren empezar a construir aplicaciones con Angular.',
      };
      let course=manifest.courseId&&await tx.one('tutorias',{id:manifest.courseId});
      if(!course){course=await tx.insert('tutorias',values);manifest.courseId=course.id;}
      else await tx.update('tutorias',{id:course.id},values);
      let sectionOrder=0;
      const usedLessons=[];
      for(const section of sections){
        sectionOrder++;
        let s=await tx.one('secciones_tutoria',{tutoriaId:course.id,orden:sectionOrder});
        if(!s)s=await tx.insert('secciones_tutoria',{tutoriaId:course.id,titulo:section.title,orden:sectionOrder});
        let lessonOrder=0;
        for(const lesson of section.lessons){
          lessonOrder++;
          const fields={tutoriaId:course.id,seccionId:s.id,tutorId:tutor.id,titulo:lesson.title,orden:lessonOrder,
            tipo:lesson.video?'video':'texto',videoArchivoId:lesson.video?.id||null,
            contenidoTexto:lesson.video?null:'Material de estudio de esta sección. Descarga los apuntes y revisa el ejemplo antes de continuar.',
            publicada:true,vistaPrevia:sectionOrder===1};
          let l=await tx.one('lecciones_tutoria',{seccionId:s.id,orden:lessonOrder});
          if(!l)l=await tx.insert('lecciones_tutoria',fields);
          else await tx.update('lecciones_tutoria',{id:l.id},fields);
          usedLessons.push(l);
          for(const r of lesson.resources){
            if(!await tx.one('recursos_leccion',{leccionId:l.id,archivoId:r.file.id}))
              await tx.insert('recursos_leccion',{leccionId:l.id,tutoriaId:course.id,tutorId:tutor.id,archivoId:r.file.id,titulo:r.name});
          }
        }
      }
      let category=await tx.one('categorias_market',{codigo:'salud-bienestar'});
      if(!category)category=await tx.insert('categorias_market',{codigo:'salud-bienestar',nombre:'Salud y bienestar',activo:true});
      const listingIds=[];
      for(const [i,item]of medicines.entries()){
        const fields={
          vendedorId:seller.id,categoriaId:category.id,titulo:item[1],descripcion:item[2]+'. Envase de referencia del catálogo de Farmacia JAE.\n\nPublicación de muestra para visualizar los detalles del artículo, guardar favoritos y consultar por el chat. El precio corresponde a esta demostración.',
          condicion:'nuevo',estado:'publicado',tipoPrecio:'fijo',precioBase:item[3],moneda:'NIO',ciudad:'Managua',
          marca:'Catálogo Farmacia JAE',modelo:item[2],zonaEntrega:'Managua',detalleEntrega:'Consulta las condiciones con el vendedor.',
          atributos:{presentacion:item[2],familia:item[4],unidad:item[0]==='alcohol'?'Frasco':'Caja'},
          formasEntrega:['punto_acordado'],etiquetas:[item[4],item[2]],disponibilidad:'unico',
          referenciaPrivada:'VISUAL-JAE-'+item[0],publicadoEn:now(),
        };
        let listing=await tx.one('anuncios_market',{vendedorId:seller.id,referenciaPrivada:fields.referenciaPrivada});
        if(!listing)listing=await tx.insert('anuncios_market',fields);
        else await tx.update('anuncios_market',{id:listing.id},fields);
        if(!await tx.one('imagenes_anuncio',{anuncioId:listing.id,archivoId:productFiles[i].id}))
          await tx.insert('imagenes_anuncio',{anuncioId:listing.id,vendedorId:seller.id,archivoId:productFiles[i].id,orden:1});
        listingIds.push(listing.id);
      }
      manifest.listings=listingIds;
      const students=await tx.find('usuarios',{email:{op:'in',value:['sofia@demo.unired.test','diego@demo.unired.test','camila@demo.unired.test']}});
      for(const student of students){
        let e=await tx.one('inscripciones_tutoria',{tutoriaId:course.id,alumnoId:student.id});
        if(!e)e=await tx.insert('inscripciones_tutoria',{tutoriaId:course.id,alumnoId:student.id,estado:'activa',activadaEn:now()});
        if(!await tx.one('progreso_lecciones',{inscripcionId:e.id,leccionId:usedLessons[0].id}))
          await tx.insert('progreso_lecciones',{inscripcionId:e.id,leccionId:usedLessons[0].id,tutoriaId:course.id,completadaEn:now()});
      }
      // Conversaciones contextualizadas para revisar ambos módulos en el panel.
      for(const [kind,resource,owner]of [['tutoria',course.id,tutor.id],['market',listingIds[0],seller.id]]){
        const student=students[0];
        const key={consultanteId:student.id,...(kind==='market'?{anuncioId:resource}:{tutoriaId:resource})};
        let c=await tx.one('conversaciones',key);
        if(!c){
          c=await tx.insert('conversaciones',{...key,tipo:kind,propietarioId:owner,ultimoMensajeEn:now()});
          for(const id of [student.id,owner])await tx.insert('participantes_conversacion',{conversacionId:c.id,usuarioId:id});
          const messages=kind==='tutoria'
            ? ['Hola, ya empecé la introducción a Angular. ¿Puedo descargar los apuntes antes de cada video?','Sí. Cada lección tiene sus PDF y, cuando corresponde, el código del ejercicio en Recursos.','Perfecto, voy a continuar con la configuración del proyecto.']
            : ['Hola, ¿puedes confirmar la presentación que aparece en la imagen?','Hola. La presentación del catálogo es una caja de 10 tabletas. Puedes revisar todos los detalles de la publicación.'];
          for(const [i,text]of messages.entries())await tx.insert('mensajes',{conversacionId:c.id,autorId:i%2?owner:student.id,clienteId:crypto.randomUUID(),contenido:text});
        }
      }
      manifest.sections=sections.length;
      manifest.lessons=usedLessons.length;
      manifest.videos=sections.flatMap(s=>s.lessons).filter(l=>l.video).length;
      manifest.resources=sections.flatMap(s=>s.lessons).reduce((n,l)=>n+l.resources.length,0);
      manifest.durationSeconds=sections.flatMap(s=>s.lessons).reduce((n,l)=>n+(l.video?.duration||0),0);
    });
    await saveManifest();
    console.log(JSON.stringify({curso:manifest.courseId,secciones:manifest.sections,lecciones:manifest.lessons,videos:manifest.videos,recursos:manifest.resources,duracionSegundos:manifest.durationSeconds,articulos:manifest.listings.length}));
  }finally{await source.destroy()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
