import { logger } from './logger';

async function main(): Promise<void> {
  // Importing `logger` loads `config` first, so required env vars are validated at startup (Story 002).
  logger.info('ClinicHub runner started');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
