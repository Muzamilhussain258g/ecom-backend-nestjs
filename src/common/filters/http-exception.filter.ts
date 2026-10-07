import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from 'generated/prisma/client';

interface ErrorResponse {
  success: boolean;
  statusCode: number;
  message: string | string[];
  errorDetails?: string;
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
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let errorDetails: string | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : hasErrorMessage(exceptionResponse)
            ? exceptionResponse.message
            : 'An error occurred';
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma Known Request Errors
      if (exception.code === 'P2021') {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        message = `Database table missing: ${exception.message}. Run 'npx prisma db push' to sync your database.`;
      } else if (exception.code === 'P2002') {
        statusCode = HttpStatus.CONFLICT;
        message = 'A record with this unique value already exists.';
      } else if (exception.code === 'P2025') {
        statusCode = HttpStatus.NOT_FOUND;
        message = 'Record not found.';
      } else {
        message = exception.message;
      }
      errorDetails = `Prisma Error (${exception.code}): ${exception.message}`;
    } else if (exception instanceof Error) {
      errorDetails = exception.message;
      message =
        process.env.NODE_ENV !== 'production'
          ? exception.message
          : 'Internal server error';
    }

    // Always log non-HTTP 400/404 errors or 500 errors to the terminal console
    if (statusCode >= 500) {
      this.logger.error(
        `[${request.method}] ${request.originalUrl} - ${statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const errorResponse: ErrorResponse = {
      success: false,
      statusCode,
      message,
      ...(process.env.NODE_ENV !== 'production' &&
        errorDetails && { errorDetails }),
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      method: request.method,
    };

    response.status(statusCode).json(errorResponse);
  }
}

