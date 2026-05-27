import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuditLogService } from './audit-log.service';

@Controller('audit-logs')
@UseGuards(AuthGuard('jwt'))
export class AuditLogsController {
  constructor(private readonly auditService: AuditLogService) {}

  @Get()
  async getLogs(@Req() req: any) {
    // Si es superadmin, ver todos los logs; de lo contrario, filtrar estrictamente por su organización
    const orgId = req.user.role === 'superadmin' ? undefined : req.user.organizationId;
    return this.auditService.findAll(orgId);
  }
}
