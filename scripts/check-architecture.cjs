// Comprueba las fronteras del dominio y los casos de uso sin conectar a la BD.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..', 'src');
let checked = 0;
function check(folder, domain = false) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      check(file, domain);
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    checked++;
    const source = fs.readFileSync(file, 'utf8');
    for (const item of ts.preProcessFile(source, true, true).importedFiles) {
      const name = item.fileName;
      const external =
        /^(?:@nestjs\/|typeorm|pg$|express$|node:(?:fs|path|child_process))/.test(
          name,
        );
      const resolved = name.startsWith('.')
        ? path
            .relative(root, path.resolve(path.dirname(file), name))
            .replaceAll('\\', '/')
        : name;
      const forbidden =
        external ||
        resolved.startsWith('shared/') ||
        (resolved.startsWith('models/') &&
          !/^models\/[^/]+\/aplicacion\//.test(resolved)) ||
        (domain &&
          (resolved.startsWith('models/') ||
            resolved.startsWith('core/aplicacion/')));
      if (forbidden)
        throw new Error(
          'Dependencia invertida: ' + path.relative(root, file) + ' -> ' + name,
        );
    }
    if (
      /\b(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(
        source,
      )
    ) {
      throw new Error('SQL fuera de shared/base_datos: ' + file);
    }
  }
}
check(path.join(root, 'core', 'dominio'), true);
check(path.join(root, 'core', 'aplicacion'));
for (const feature of fs.readdirSync(path.join(root, 'models'))) {
  const folder = path.join(root, 'models', feature, 'aplicacion');
  if (fs.existsSync(folder)) check(folder);
}
console.log(
  'OK: ' +
    checked +
    ' archivos del nucleo y casos de uso sin dependencias exteriores ni SQL.',
);
