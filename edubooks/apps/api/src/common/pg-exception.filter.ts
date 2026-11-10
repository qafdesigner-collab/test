import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

/** Turns PostgreSQL constraint errors into meaningful 4xx responses. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Error');
  catch(err: any, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse();
      return res.status(err.getStatus()).json(typeof body === 'string' ? { statusCode: err.getStatus(), message: body } : body);
    }
    const pg = err?.cause?.code ? err.cause : err; // drizzle wraps driver errors
    const map: Record<string, [number, string]> = {
      '23505': [409, 'This value already exists (duplicate).'],
      '23503': [409, 'This item is still in use or refers to something that does not exist.'],
      '23514': [400, 'The data breaks a validation rule.'],
      '22P02': [400, 'Invalid identifier or value format.'],
      '42501': [403, 'Not allowed for your organisation.'],
    };
    // RAISE EXCEPTION from our business-rule triggers → 409 with the trigger's message.
    if (pg?.code === 'P0001') return res.status(409).json({ statusCode: 409, message: pg.message });
    const hit = pg?.code && map[pg.code];
    if (hit) {
      return res.status(hit[0]).json({ statusCode: hit[0], message: hit[1], detail: pg.constraint || pg.detail });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ statusCode: 413, message: 'File is too large.' });
    this.log.error(err?.message, err?.stack);
    return res.status(500).json({ statusCode: 500, message: 'Unexpected server error' });
  }
}
