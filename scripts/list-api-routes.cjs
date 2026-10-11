// Inventario obtenido de los decorators compilados, sin conectar a PostgreSQL.
require('reflect-metadata');
const fs = require('node:fs');
const path = require('node:path');
const { RequestMethod } = require('@nestjs/common');
const { PATH_METADATA, METHOD_METADATA, HTTP_CODE_METADATA } = require('@nestjs/common/constants');
const directory = path.resolve(__dirname, '..', 'dist/infrastructure/http/controllers');
const routes = [];
for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.controller.js'))) {
  for (const controller of Object.values(require(path.join(directory, file)))) {
    if (typeof controller !== 'function' || !controller.prototype) continue;
    const prefix = Reflect.getMetadata(PATH_METADATA, controller);
    if (prefix === undefined) continue;
    const tag = Reflect.getMetadata('swagger/apiUseTags', controller)?.[0] ?? controller.name;
    for (const name of Object.getOwnPropertyNames(controller.prototype)) {
      if (name === 'constructor') continue;
      const fn = controller.prototype[name]; const method = Reflect.getMetadata(METHOD_METADATA, fn);
      if (method === undefined) continue;
      const endpoint = Reflect.getMetadata(PATH_METADATA, fn);
      const parameters = Reflect.getMetadata('swagger/apiParameters', fn) ?? [];
      const body = parameters.find((entry) => entry.in === 'body');
      const mode = Reflect.getMetadata('unired:access', fn) ?? Reflect.getMetadata('unired:access', controller) ?? 'active';
      routes.push({ tag, method: RequestMethod[method], path: '/api/v1/' + [prefix, endpoint].filter((value) => value && value !== '/').join('/'),
        summary: Reflect.getMetadata('swagger/apiOperation', fn)?.summary ?? name,
        access: mode, status: Reflect.getMetadata(HTTP_CODE_METADATA, fn) ?? (RequestMethod[method] === 'POST' ? 201 : 200),
        fields: Object.keys(body?.schema?.properties ?? {}), required: body?.schema?.required ?? [] });
    }
  }
}
console.log(JSON.stringify(routes));
