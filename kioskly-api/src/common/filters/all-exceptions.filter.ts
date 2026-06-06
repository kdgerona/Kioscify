import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Logger } from 'nestjs-pino';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const statusCode = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const rawResponse = isHttp ? exception.getResponse() : null;
    const message = isHttp
      ? typeof rawResponse === 'string'
        ? rawResponse
        : (rawResponse as { message?: string | string[] }).message ?? exception.message
      : 'Internal server error';

    const logMeta = { statusCode, path: request.url };
    const logMessage = typeof message === 'string' ? message : JSON.stringify(message);

    if (statusCode >= 500) {
      this.logger.error(
        { ...logMeta, stack: (exception as Error).stack },
        logMessage,
      );
    } else {
      this.logger.warn(logMeta, logMessage);
    }

    response.status(statusCode).json({
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
