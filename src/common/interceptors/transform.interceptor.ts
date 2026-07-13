import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { response } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const reflactorContext = context.getHandler()
    // response = con
    return next.handle();
  }
}
