import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  message: string | string[];
  path: string;
  timestamp: string;
  method: string;
}

function hasErrorMessage(
  value: object,
): value is { message: string | string[] } {
  if (!('message' in value)) return false;

  const { message } = value;
  return (
    typeof message === 'string' ||
    (Array.isArray(message) &&
      message.every((item): item is string => typeof item === 'string'))
  );
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const statusCode =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const message =
      typeof exceptionResponse === 'string'
        ? exceptionResponse
        : hasErrorMessage(exceptionResponse)
          ? exceptionResponse.message
          : 'Internal server error';

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode,
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      method: request.method,
    };

    response.status(statusCode).json(errorResponse);
  }
}
