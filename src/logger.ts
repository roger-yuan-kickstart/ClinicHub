import fs from 'fs';
import path from 'path';
import pino from 'pino';
import pinoPretty from 'pino-pretty';
import { config } from './config';

function ensureLogDirectoryExists(): void {
  fs.mkdirSync(config.logDir, { recursive: true });
}

function dailyLogFileName(reference: Date): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}.log`;
}

function createBaseLogger(): pino.Logger {
  ensureLogDirectoryExists();
  const logFilePath = path.join(config.logDir, dailyLogFileName(new Date()));
  const prettyStream = pinoPretty({
    colorize: true,
    sync: true,
    translateTime: 'SYS:iso',
    ignore: 'pid,hostname',
  });
  const fileStream = pino.destination(logFilePath);
  const streams = pino.multistream([
    { level: config.logLevel, stream: prettyStream },
    { level: config.logLevel, stream: fileStream },
  ]);

  return pino(
    {
      level: config.logLevel,
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level(label) {
          return { level: label };
        },
      },
      serializers: {
        err: pino.stdSerializers.err,
      },
    },
    streams,
  );
}

const baseLogger = createBaseLogger();

function wrapErrorLogFn(boundError: pino.LogFn, target: pino.Logger): pino.LogFn {
  const wrapped = (...params: unknown[]): void => {
    const [first, msg, ...args] = params;
    if (first instanceof Error && (msg === undefined || typeof msg === 'string')) {
      const messageText = typeof msg === 'string' ? msg : first.message;
      const rest = typeof msg === 'string' ? args : [];
      boundError.call(target, { err: first }, messageText, ...rest);
      return;
    }
    (boundError as (...p: unknown[]) => void).call(target, first, msg, ...args);
  };
  return wrapped as pino.LogFn;
}

export const logger = new Proxy(baseLogger, {
  get(target, prop, receiver) {
    if (prop === 'error') {
      const boundError = Reflect.get(target, 'error', receiver) as pino.LogFn;
      return wrapErrorLogFn(boundError.bind(target), target);
    }
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return (value as (...fnArgs: unknown[]) => unknown).bind(target);
    }
    return value;
  },
}) as pino.Logger;
