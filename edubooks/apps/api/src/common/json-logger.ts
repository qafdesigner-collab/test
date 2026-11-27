import { ConsoleLogger, LoggerService } from '@nestjs/common';

/** One JSON object per line — ready for Loki, CloudWatch, ELK, Datadog… Never logs request bodies. */
export class JsonLogger implements LoggerService {
  private write(level: string, message: unknown, context?: unknown, extra?: Record<string, unknown>) {
    const line = { time: new Date().toISOString(), level, context: typeof context === 'string' ? context : undefined,
      ...(typeof message === 'object' && message !== null ? message : { message: String(message) }), ...extra };
    (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
  }
  log(m: unknown, c?: string) { this.write('info', m, c); }
  error(m: unknown, trace?: string, c?: string) { this.write('error', m, c, trace ? { stack: trace.split('\n').slice(0, 8).join('\n') } : undefined); }
  warn(m: unknown, c?: string) { this.write('warn', m, c); }
  debug(m: unknown, c?: string) { if (process.env.LOG_LEVEL === 'debug') this.write('debug', m, c); }
  verbose(m: unknown, c?: string) { if (process.env.LOG_LEVEL === 'debug') this.write('verbose', m, c); }
}
export const prettyLogger = () => new ConsoleLogger();
