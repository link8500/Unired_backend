// Archivo: src/shared/cli/crear-admin.ts
// Recoge los argumentos de consola y ejecuta la creación segura de una cuenta administradora.

import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import source from '../base_datos/origen-datos';
import { PostgresDatabase } from '../base_datos/postgres.database';
import { ContrasenasScrypt } from '../seguridad/criptografia.providers';
import { CrearAdministradorUseCase } from '../../models/identidad/aplicacion/crear-administrador.use-case';

async function credentials(): Promise<{
  nombre: string;
  email: string;
  password: string;
}> {
  if (process.env.BOOTSTRAP_ADMIN_EMAIL && process.env.BOOTSTRAP_ADMIN_PASSWORD)
    return {
      nombre: process.env.BOOTSTRAP_ADMIN_NAME ?? 'Administrador',
      email: process.env.BOOTSTRAP_ADMIN_EMAIL,
      password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
    };
  if (!process.stdin.isTTY)
    throw new Error(
      'Ejecuta este comando en una terminal interactiva o configura BOOTSTRAP_ADMIN_EMAIL/PASSWORD.',
    );
  let muted = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const terminal = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });
  try {
    const nombre = await terminal.question('Nombre del administrador: ');
    const email = await terminal.question('Correo del administrador: ');
    const pending = terminal.question(
      'Contrasena (12-128 caracteres; entrada oculta): ',
    );
    muted = true;
    const password = await pending;
    muted = false;
    process.stdout.write('\n');
    return { nombre, email, password };
  } finally {
    terminal.close();
  }
}
async function main(): Promise<void> {
  const body = await credentials();
  await source.initialize();
  try {
    const result = await new CrearAdministradorUseCase(
      new PostgresDatabase(source),
      new ContrasenasScrypt(),
    ).execute(body);
    console.log(result.mensaje);
  } finally {
    await source.destroy();
  }
}
void main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
