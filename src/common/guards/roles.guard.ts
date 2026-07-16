import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    return true;
  }
}



// common/guards/roles.guard.ts

// import {
//   CanActivate,
//   ExecutionContext,
//   ForbiddenException,
//   Injectable,
// } from '@nestjs/common';
// import { Reflector } from '@nestjs/core';
// import { Request } from 'express';
// import { ROLES_KEY } from '../decorators/roles.decorator';

// interface AuthenticatedUser {
//   id: number;
//   email: string;
//   role: string;
// }

// interface AuthenticatedRequest extends Request {
//   user?: AuthenticatedUser;
// }

// @Injectable()
// export class RolesGuard implements CanActivate {
//   constructor(private readonly reflector: Reflector) {}

//   canActivate(context: ExecutionContext): boolean {
//     const requiredRoles = this.reflector.getAllAndOverride<string[]>(
//       ROLES_KEY,
//       [
//         context.getHandler(),
//         context.getClass(),
//       ],
//     );

//     if (!requiredRoles || requiredRoles.length === 0) {
//       return true;
//     }

//     const request =
//       context.switchToHttp().getRequest<AuthenticatedRequest>();

//     const user = request.user;

//     if (!user) {
//       throw new ForbiddenException('User information not found');
//     }

//     const hasRole = requiredRoles.includes(user.role);

//     if (!hasRole) {
//       throw new ForbiddenException(
//         'You do not have permission to access this resource',
//       );
//     }

//     return true;
//   }
// }