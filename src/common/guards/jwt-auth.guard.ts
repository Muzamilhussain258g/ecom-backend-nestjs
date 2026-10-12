import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { Observable } from 'rxjs';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Authorization token is required');
    }
    const [type, token, extra] = authHeader.split(' ');
    if (type !== 'Bearer' || !token || extra !== undefined) {
      throw new UnauthorizedException('Invalid authorization header format');
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = AuthenticatedUser>(
    error: unknown,
    user: TUser | false | null,
  ): TUser {
    if (error instanceof Error) {
      throw error;
    }
    if (error || !user) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
