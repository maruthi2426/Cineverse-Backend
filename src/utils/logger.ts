export enum LogLevel {
  INFO = "INFO",
  WARN = "WARN",
  ERROR = "ERROR",
  DEBUG = "DEBUG",
}

const LOG_LEVEL =
  (process.env.LOG_LEVEL as LogLevel) || LogLevel.INFO;

function shouldLog(level: LogLevel): boolean {
  const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
  return levels.indexOf(level) >= levels.indexOf(LOG_LEVEL);
}

function formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : "";
  return `[${timestamp}] [${level}] [${context}] ${message}${dataStr}`;
}

export const logger = {
  debug: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.DEBUG)) console.debug(formatMessage(LogLevel.DEBUG, context, message, data));
  },
  info: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.INFO)) console.log(formatMessage(LogLevel.INFO, context, message, data));
  },
  warn: (context: string, message: string, data?: unknown) => {
    if (shouldLog(LogLevel.WARN)) console.warn(formatMessage(LogLevel.WARN, context, message, data));
  },
  error: (context: string, message: string, error?: unknown) => {
    if (shouldLog(LogLevel.ERROR)) {
      const errStr = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      console.error(formatMessage(LogLevel.ERROR, context, `${message}: ${errStr}`));
    }
  },
};
