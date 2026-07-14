import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response, } from 'express';
import { map, Observable } from 'rxjs';

export interface ApiResponse<T> {
  statusCode: number,
  message: string,
  data: T,
  path: string;
  timestamp: string;
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> { // NestInterceptor<Input, Output>
  constructor(private readonly reflector: Reflector) { }
  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    const reflectorContext = context.getHandler()
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();

    const statusCode = response.statusCode ?? 200;
    const message = this.reflector.get<string>('response-message', reflectorContext) || 'Success';

    return next.handle().pipe(map((data: T) => {
      return {
        success: statusCode >= 200 && statusCode < 300,
        method: request.method,
        statusCode,
        message,
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
        data,
      }
    }));
  }
}
