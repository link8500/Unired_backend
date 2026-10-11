const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..', 'src');
let checked = 0;
function check(folder, forbidden) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) check(file, forbidden);
    else if (entry.name.endsWith('.ts')) {
      checked++;
      const source = fs.readFileSync(file, 'utf8');
      const imports = source.matchAll(
        /(?:from\s+|import\s*\(|require\s*\()['"]([^'"]+)['"]/g,
      );
      for (const match of imports)
        if (forbidden.some((pattern) => pattern.test(match[1])))
          throw new Error(
            'Dependencia invertida: ' +
              path.relative(root, file) +
              ' -> ' +
              match[1],
          );
      if (
        /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/i.test(
          source,
        )
      )
        throw new Error('SQL fuera de infrastructure: ' + file);
    }
  }
}
check(path.join(root, 'domain'), [
  /application/,
  /infrastructure/,
  /@nestjs/,
  /typeorm/,
  /^pg$/,
  /express/,
  /^node:(fs|path|child_process)/,
]);
check(path.join(root, 'application'), [
  /infrastructure/,
  /@nestjs/,
  /typeorm/,
  /^pg$/,
  /express/,
  /^node:(fs|path|child_process)/,
]);
console.log(
  'OK: ' + checked + ' archivos del núcleo sin dependencias exteriores ni SQL.',
);
