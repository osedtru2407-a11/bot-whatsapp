import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class SuperadminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.isSuperadmin) {
      throw new ForbiddenException('Acceso denegado. Se requieren privilegios de Superusuario.');
    }
    return true;
  }
}

