import { FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from 'jsonwebtoken';

// ─── Error Response Shape ─────────────────────────────────────────────────────
interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
}

// ─── Prisma Error Codes → HTTP Status ────────────────────────────────────────
const PRISMA_ERROR_STATUS: Record<string, number> = {
  P2000: 400, // Value too long
  P2001: 404, // Record not found
  P2002: 409, // Unique constraint violation
  P2003: 400, // Foreign key constraint violation
  P2004: 400, // Constraint violation
  P2005: 400, // Invalid value for field
  P2006: 400, // Invalid value
  P2007: 400, // Data validation error
  P2011: 400, // Null constraint violation
  P2012: 400, // Missing required value
  P2013: 400, // Missing required arg
  P2014: 400, // Relation violation
  P2015: 404, // Related record not found
  P2016: 400, // Query interpretation error
  P2017: 400, // Records not connected
  P2018: 400, // Connected records not found
  P2019: 400, // Input error
  P2020: 400, // Value out of range
  P2021: 500, // Table not found
  P2022: 500, // Column not found
  P2025: 404, // Record required for operation not found
};

const PRISMA_ERROR_MESSAGES: Record<string, string> = {
  P2002: 'A record with this value already exists.',
  P2003: 'Referenced record does not exist.',
  P2025: 'Record not found.',
  P2015: 'Related record not found.',
};

// ─── Error Handler ────────────────────────────────────────────────────────────
export function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): void {
  const { log } = request;

  // ── ZodError: validation failures ────────────────────────────────────────
  if (error instanceof ZodError) {
    const details = error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
      code: e.code,
    }));

    const response: ErrorResponse = {
      statusCode: 400,
      error: 'Validation Error',
      message: 'Request validation failed',
      details,
    };
    reply.code(400).send(response);
    return;
  }

  // ── JWT Errors ────────────────────────────────────────────────────────────
  if (error instanceof TokenExpiredError) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Access token has expired. Please refresh your session.',
    } as ErrorResponse);
    return;
  }

  if (error instanceof JsonWebTokenError || error instanceof NotBeforeError) {
    reply.code(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid authentication token.',
    } as ErrorResponse);
    return;
  }

  // ── Prisma Known Request Errors ───────────────────────────────────────────
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const statusCode = PRISMA_ERROR_STATUS[error.code] ?? 400;
    const message =
      PRISMA_ERROR_MESSAGES[error.code] ||
      `Database error (${error.code})`;

    log.warn({ prismaCode: error.code, meta: error.meta }, message);

    reply.code(statusCode).send({
      statusCode,
      error: 'Database Error',
      message,
      details:
        process.env.NODE_ENV !== 'production'
          ? { code: error.code, meta: error.meta }
          : undefined,
    } as ErrorResponse);
    return;
  }

  // ── Prisma Unknown Request Errors ─────────────────────────────────────────
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    log.error({ err: error }, 'Prisma unknown error');
    reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected database error occurred.',
    } as ErrorResponse);
    return;
  }

  // ── Prisma Validation Error ───────────────────────────────────────────────
  if (error instanceof Prisma.PrismaClientValidationError) {
    reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid data provided to database.',
      details:
        process.env.NODE_ENV !== 'production' ? error.message : undefined,
    } as ErrorResponse);
    return;
  }

  // ── Fastify Built-in Errors ───────────────────────────────────────────────
  if (error.statusCode) {
    const statusCode = error.statusCode;
    reply.code(statusCode).send({
      statusCode,
      error: error.name || 'Error',
      message: error.message,
    } as ErrorResponse);
    return;
  }

  // ── Generic 500 ───────────────────────────────────────────────────────────
  log.error({ err: error }, 'Unhandled error');

  reply.code(500).send({
    statusCode: 500,
    error: 'Internal Server Error',
    message:
      process.env.NODE_ENV !== 'production'
        ? error.message
        : 'An unexpected error occurred. Please try again later.',
  } as ErrorResponse);
}
