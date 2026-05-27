import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { IntegrationService } from '../../integration/integration.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    @Inject(IntegrationService)
    private readonly integrationService: IntegrationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Leer el token de la cabecera X-API-Key o del Bearer Token estándar
    let apiKey = request.headers['x-api-key'] as string;
    
    if (!apiKey) {
      const authHeader = request.headers['authorization'] as string;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        apiKey = authHeader.substring(7);
      } else if (authHeader) {
        apiKey = authHeader;
      }
    }

    if (!apiKey) {
      throw new UnauthorizedException('Falta la credencial de autenticación (X-API-Key o Authorization Bearer)');
    }

    try {
      // Buscar la integración que posea ese secreto único
      const integration = await this.integrationService.findBySecret(apiKey);
      if (!integration) {
        throw new UnauthorizedException('API Key o token de integración inválido');
      }

      // Almacenar el organizationId e integrationId en el request para filtrado multi-tenant
      request.organizationId = integration.organizationId;
      request.integrationId = integration.id;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Acceso no autorizado: API Key inválida');
    }
  }
}
