// Preserva la configuración existente y añade únicamente secretos faltantes.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const target = path.join(root, '.env');
const original = fs.existsSync(target)
  ? fs.readFileSync(target, 'utf8')
  : fs.readFileSync(path.join(root, '.env.example'), 'utf8');
let content = original;
for (const [name, placeholder, create] of [
  [
    'DB_PASSWORD',
    'CAMBIAR_CON_SETUP_ENV',
    () => crypto.randomBytes(32).toString('hex'),
  ],
  [
    'JWT_ACCESS_SECRET',
    'GENERAR_CON_SETUP_ENV',
    () => crypto.randomBytes(48).toString('base64url'),
  ],
  [
    'MAIL_ENCRYPTION_KEY',
    'GENERAR_CON_SETUP_ENV',
    () => crypto.randomBytes(32).toString('hex'),
  ],
]) {
  const line = new RegExp('^' + name + '=(.*)$', 'm');
  const found = content.match(line);
  if (!found)
    content +=
      (content.endsWith('\n') ? '' : '\n') + name + '=' + create() + '\n';
  else if (!found[1].trim() || found[1].trim() === placeholder)
    content = content.replace(line, name + '=' + create());
}
if (!fs.existsSync(target) || content !== original) {
  fs.writeFileSync(target, content, { mode: 0o600 });
  console.log(
    'Entorno preparado; se conservan los valores existentes y no se imprimen secretos.',
  );
} else console.log('El entorno ya está configurado; no se modificó.');
