import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockLogger: { warn: jest.Mock; error: jest.Mock };
  let mockResponse: { status: jest.Mock; json: jest.Mock };
  let mockRequest: { url: string };
  let mockHost: any;

  beforeEach(() => {
    mockLogger = { warn: jest.fn(), error: jest.fn() };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = { url: '/api/v1/test' };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
    filter = new AllExceptionsFilter(mockLogger as any);
  });

  it('logs 4xx HttpException at warn level with statusCode and path', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), mockHost);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { statusCode: 404, path: '/api/v1/test' },
      'Not Found',
    );
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('logs non-HttpException at error level with stack trace', () => {
    const err = new Error('Database crashed');
    filter.catch(err, mockHost);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        path: '/api/v1/test',
        stack: err.stack,
      }),
      'Internal server error',
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it('returns 404 JSON response for HttpException NOT_FOUND', () => {
    filter.catch(new HttpException('Not Found', HttpStatus.NOT_FOUND), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: 'Not Found', path: '/api/v1/test' }),
    );
  });

  it('returns 500 JSON response for unexpected Error', () => {
    filter.catch(new Error('Crash'), mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, path: '/api/v1/test' }),
    );
  });

  it('logs 401 UnauthorizedException at warn level', () => {
    filter.catch(new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED), mockHost);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      { statusCode: 401, path: '/api/v1/test' },
      'Unauthorized',
    );
  });
});
