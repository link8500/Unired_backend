# Arrancar UniRed

NestJS se ejecuta en tu computadora. Docker ejecuta únicamente PostgreSQL.

## Requisitos

- Node.js 22 o superior compatible con NestJS 11, y npm.
- Docker Desktop abierto con contenedores Linux.
- Para cargas: Windows Defender disponible; en otro sistema configura ClamAV.
- Para videos: la herramienta local que instala `setup:media` (no instala servicios).

## Primer arranque

Abre una terminal en la carpeta de este backend, donde está `package.json`:

```sh
npm ci
npm run setup:env
npm run docker:up
npm run db:migrate
npm run setup:media
npm run admin:create
npm run start:dev
```

`setup:env` crea o completa las claves faltantes de `.env`; conserva la contraseña
existente de PostgreSQL. `docker:up` inicia solo la base. `db:migrate` aplica
migraciones desde tu computadora sin reconstruir las tablas existentes.
`setup:media` descarga FFmpeg/ffprobe verificados a `.tools`; puedes omitirlo
si no usarás videos o ya configuraste `FFPROBE_PATH` compatible.

`admin:create` pide nombre, correo y contraseña para el primer administrador.
No hay una contraseña predeterminada. Ejecútalo solo una vez; no eleva cuentas
existentes. Mantén abierta la terminal de `start:dev`.

Después de arrancar:

- [Documentación y pruebas de la API](http://localhost:3000/docs).
- [Comprobar API y PostgreSQL](http://localhost:3000/api/v1/health).
- Base de las peticiones: `http://localhost:3000/api/v1`.

En desarrollo, los correos de verificación llegan a la carpeta privada
`.local-mails`. Para enviarlos a direcciones reales configura SMTP en `.env`.

## Siguientes arranques

```sh
npm run docker:up
npm run start:dev
```

Si hay migraciones nuevas, ejecuta `npm run db:migrate` antes de iniciar NestJS.

## Conexión y puertos

La API escucha en `127.0.0.1:3000` (`API_HOST` y `PORT`).
PostgreSQL se publica en `127.0.0.1:5433`.
`DB_PORT` debe coincidir con `DB_EXTERNAL_PORT`; NestJS local usa
`DB_HOST=127.0.0.1`, no `postgres`.
Si un puerto está ocupado, ajusta tu configuración.

## Comprobar y detener

```sh
docker compose ps
docker compose logs --tail=100 postgres
```

Los errores de NestJS aparecen en la terminal de `start:dev`.
Detén NestJS con `Ctrl+C`. Para detener PostgreSQL conservando sus datos:

```sh
npm run docker:down
```

No elimines el volumen de PostgreSQL para un arranque normal.
