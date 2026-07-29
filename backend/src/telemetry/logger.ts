import pino from 'pino';

const rootLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

export function createLogger(name: string) {
  return rootLogger.child({ service: name });
}

export default rootLogger;
