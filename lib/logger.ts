import { env, type LogLevel } from '@/lib/env';

/**
 * Minimal structured logger tuned for Google Cloud Logging.
 *
 * Cloud Run captures stdout/stderr and, when a line is valid JSON, parses it
 * into a structured LogEntry. Using the field names Cloud Logging recognises
 * (`severity`, `message`, `logging.googleapis.com/trace`) means logs are
 * filterable and correlated with requests in the console with no agent and no
 * dependency.
 *
 * Deliberately dependency-free. If a project outgrows this (sampling, redaction,
 * transports), swap in `pino` behind this same interface so call sites do not
 * change.
 */

const SEVERITY: Record<LogLevel, string> = {
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export type LogContext = Record<string, unknown>;

function serialiseError(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
    };
  }
  return { error: String(error) };
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[env.logLevel]) return;

  const entry = {
    severity: SEVERITY[level],
    message,
    service: env.appName,
    version: env.appVersion,
    timestamp: new Date().toISOString(),
    ...context,
  };

  // In development a single JSON line per log is unreadable in a terminal, so
  // pretty-print there and keep machine-readable output for deployed runtimes.
  const line = env.isDevelopment ? JSON.stringify(entry, null, 2) : JSON.stringify(entry);

  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    // eslint-disable-next-line no-console -- the logger is the one allowed caller
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, error?: unknown, context?: LogContext) =>
    emit('error', message, { ...context, ...(error === undefined ? {} : serialiseError(error)) }),
};

export type Logger = typeof logger;
