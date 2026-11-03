import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const logDirectory = path.join(backendRoot, 'logs');
const logFile = path.join(logDirectory, 'backend.log');

function write(level: 'INFO' | 'WARN' | 'ERROR', message: string): void {
  const line = `${new Date().toISOString()} [${level}] ${message}`;

  console.log(line);

  try {
    fs.mkdirSync(logDirectory, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`, 'utf8');
  } catch (error) {
    console.error(
      '[logger] Could not write backend.log:',
      error instanceof Error ? error.message : error,
    );
  }
}

export const logger = {
  info(message: string): void {
    write('INFO', message);
  },
  warn(message: string): void {
    write('WARN', message);
  },
  error(message: string): void {
    write('ERROR', message);
  },
};

export const paths = {
  backendRoot,
  logFile,
  repositoryRoot: path.resolve(backendRoot, '..', '..'),
};
