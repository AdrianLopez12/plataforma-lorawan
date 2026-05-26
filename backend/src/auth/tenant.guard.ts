import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    // El Super Administrador tiene pase libre global
    if (user.role === 'superadmin') {
      return true;
    }

    // Obtener la organización destino de la petición (de query, body o params)
    const targetOrgId = 
      request.params.organizationId ||
      request.query.organizationId ||
      request.body.organizationId;

    // Si la petición específica un tenant, comprobar que coincida con el del usuario
    if (targetOrgId && targetOrgId !== user.organizationId) {
      throw new ForbiddenException('Acceso denegado: aislamiento de inquilinos violado');
    }

    return true;
  }
}
