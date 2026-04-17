import { config } from './config';

async function main(): Promise<void> {
  // Entry point. Story 003 wires structured logging.
  // Importing `config` validates environment variables at startup (Story 002).
  void config;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
