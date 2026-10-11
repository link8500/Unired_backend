import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Database } from '../../../domain/common/contracts';
import { Public } from '../common/api.decorators';

@ApiTags('Estado')
@Controller('health')
export class HealthController {
  constructor(@Inject('DATABASE') private readonly db: Database) {}
  @Public()
  @Get()
  @ApiOperation({ summary: 'Comprobar API y conexión a PostgreSQL' })
  async health() {
    await this.db.read.store.count('roles');
    return { status: 'ok', database: 'postgresql' };
  }
}
