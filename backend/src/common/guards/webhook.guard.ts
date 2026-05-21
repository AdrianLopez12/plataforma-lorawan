import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { IntegrationService } from '../../integration/integration.service';

@Injectable()
export class WebhookGuard implements CanActivate {
  constructor(
    @Inject(IntegrationService)
    private readonly integrationService: IntegrationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const integrationId = request.params.integrationId;

    if (!integrationId) {
      throw new UnauthorizedException('Falta el ID de integración en el webhook');
    }

    try {
      const integration = await this.integrationService.findOne(integrationId);
      const authHeader: string = request.headers['authorization'] ?? '';
      
      const secret = integration.secret;
      const isValid =
        authHeader === `Bearer ${secret}` || authHeader === secret;

      if (!isValid) {
        throw new UnauthorizedException('Webhook token inválido para esta integración');
      }

      // Guardar el objeto de integración en el request para que el controlador lo use
      request.integration = integration;
      return true;
    } catch (error) {
      throw new UnauthorizedException('ID de integración inválido o no encontrado');
    }
  }
}
