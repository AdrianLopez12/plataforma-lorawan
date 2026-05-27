import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';

@Injectable()
export class AuditLogService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  async record(
    action: string,
    user: any,
    details?: any,
    ipAddress?: string,
    orgId?: string,
  ): Promise<AuditLog> {
    const log = this.auditRepo.create({
      action,
      userName: user?.name || 'System',
      userEmail: user?.email || 'system@lorawan.com',
      details: details ? (typeof details === 'object' ? JSON.stringify(details) : String(details)) : undefined,
      ipAddress: ipAddress || '127.0.0.1',
      organizationId: orgId || user?.organizationId,
    });
    return this.auditRepo.save(log);
  }

  async findAll(orgId?: string): Promise<AuditLog[]> {
    if (orgId) {
      return this.auditRepo.find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' },
        take: 100, // Limit to last 100 logs for performance
      });
    }
    return this.auditRepo.find({
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
