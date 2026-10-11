import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Response } from 'express';
import {
  MediaUseCases,
  purposes,
} from '../../../application/media/media.use-cases';
import { Actor, Row } from '../../../domain/common/contracts';
import { DomainError, ensure } from '../../../domain/common/errors';
import {
  BodyFields,
  CurrentActor,
  FileTicket,
  Paged,
} from '../common/api.decorators';
import { Query } from '@nestjs/common';
import { presentFile } from '../serializers/file.presenter';

const upload = diskStorage({
  destination: (_request, _file, callback) => {
    const folder = resolve(process.env.STORAGE_ROOT ?? './storage', '_uploads');
    mkdir(folder, { recursive: true }).then(
      () => callback(null, folder),
      (error: Error) => callback(error, folder),
    );
  },
  filename: (_request, _file, callback) =>
    callback(null, randomUUID() + '.upload'),
});
@ApiTags('Archivos privados y multimedia')
@ApiBearerAuth()
@Controller()
export class MediaController {
  constructor(private readonly media: MediaUseCases) {}
  @Post('files')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir archivo, detectar formato real, escanear y procesar',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        proposito: { type: 'string', enum: [...purposes] },
      },
      required: ['file', 'proposito'],
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: upload,
      limits: {
        files: 1,
        fields: 1,
        parts: 2,
        fieldSize: 200,
        fileSize: Number(process.env.UPLOAD_VIDEO_MAX_BYTES ?? 1073741824),
      },
    }),
  )
  async upload(
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    ensure(file, 'Selecciona un archivo.');
    try {
      return presentFile(
        await this.media.upload(actor, body, file.path, file.originalname),
      );
    } finally {
      await unlink(file.path).catch(() => undefined);
    }
  }
  @Get('me/files')
  @Paged()
  @ApiOperation({
    summary: 'Mis archivos y estados; nunca expone storage_key ni hash',
  })
  async mine(@CurrentActor() actor: Actor, @Query() query: Row) {
    const page = await this.media.mine(actor, query);
    return { ...page, items: page.items.map(presentFile) };
  }
  @Get('files/:id')
  @ApiOperation({ summary: 'Consultar metadatos de mi archivo' })
  async metadata(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return presentFile(await this.media.metadata(actor, id));
  }
  @Post('files/:id/process')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Reintentar procesamiento real; no permite marcar limpio desde el cliente',
  })
  async process(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return presentFile(await this.media.process(actor, id));
  }
  @Post('files/:id/access')
  @ApiOperation({
    summary:
      'Enlace temporal de 120 segundos para reproducción; vuelve a comprobar sesión y recurso',
  })
  async access(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const ticket = await this.media.ticket(actor, id);
    return {
      url:
        '/api/v1/files/' +
        ticket.fileId +
        '/content?ticket=' +
        encodeURIComponent(ticket.ticket),
      expiresIn: ticket.expiresIn,
    };
  }
  @Delete('files/:id')
  @ApiOperation({
    summary:
      'Eliminar lógicamente archivo propio no vinculado; conserva objetos históricos',
  })
  remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.media.remove(actor, id);
  }
  @Put('me/avatar')
  @BodyFields('Vincular o retirar mi avatar', ['archivoId'])
  avatar(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.media.profileImage(actor, 'avatar', body);
  }
  @Put('me/banner')
  @BodyFields('Vincular o retirar mi banner', ['archivoId'])
  banner(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.media.profileImage(actor, 'banner_perfil', body);
  }
  @FileTicket()
  @Get('files/:id/content')
  @ApiQuery({ name: 'ticket', required: false, type: String })
  @ApiOperation({
    summary:
      'Leer contenido con permisos, Bearer o ticket temporal; soporta Range',
  })
  async content(
    @CurrentActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.stream(await this.media.download(actor, id), range, response);
  }
  @FileTicket()
  @Get('files/:id/thumbnail')
  @ApiQuery({ name: 'ticket', required: false, type: String })
  @ApiOperation({
    summary: 'Miniatura WebP con los mismos permisos del original',
  })
  async thumbnail(
    @CurrentActor() actor: Actor | undefined,
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @Res() response: Response,
  ) {
    return this.stream(
      await this.media.download(actor, id, true),
      range,
      response,
    );
  }
  private async stream(
    file: {
      path: string;
      tamanoBytes: string;
      mimeDetectado: string;
      nombreOriginal: string;
    },
    range: string | undefined,
    response: Response,
  ): Promise<void> {
    let actualSize: number;
    try {
      actualSize = (await stat(file.path)).size;
    } catch {
      throw new DomainError(
        404,
        'OBJECT_NOT_FOUND',
        'El objeto físico no está disponible.',
      );
    }
    const size = Number(file.tamanoBytes);
    ensure(
      actualSize === size && size > 0,
      'El tamaño del objeto físico no coincide.',
      409,
    );
    let start = 0;
    let end = size - 1;
    if (range) {
      const match = range.match(/^bytes=(\d*)-(\d*)$/);
      if (!match || (!match[1] && !match[2])) {
        response.setHeader('Content-Range', 'bytes */' + size);
        throw new DomainError(416, 'INVALID_RANGE', 'Rango inválido.');
      }
      if (!match[1]) {
        const suffix = Number(match[2]);
        ensure(
          Number.isSafeInteger(suffix) && suffix > 0,
          'Rango inválido.',
          416,
        );
        start = Math.max(0, size - suffix);
      } else {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end < start ||
        start >= size
      ) {
        response.setHeader('Content-Range', 'bytes */' + size);
        throw new DomainError(416, 'INVALID_RANGE', 'Rango fuera del archivo.');
      }
      response.status(206);
      response.setHeader(
        'Content-Range',
        'bytes ' + start + '-' + end + '/' + size,
      );
    }
    response.setHeader('Content-Type', file.mimeDetectado);
    response.setHeader('Content-Length', String(end - start + 1));
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    const disposition =
      file.mimeDetectado === 'application/pdf' ? 'attachment' : 'inline';
    const name = String(file.nombreOriginal).replace(/[\r\n\0]/g, '_');
    response.setHeader(
      'Content-Disposition',
      disposition + "; filename*=UTF-8''" + encodeURIComponent(name),
    );
    const stream = createReadStream(file.path, { start, end });
    stream.on('error', () => {
      if (!response.headersSent) response.status(500).end();
      else response.destroy();
    });
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  }
}
