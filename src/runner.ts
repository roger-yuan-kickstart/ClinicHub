import { SupervisedUI, registerSupervisedUi } from './automation/supervisedUI';
import { logger } from './logger';

async function main(): Promise<void> {
  // Importing `logger` loads `config` first, so required env vars are validated at startup (Story 002).
  // Supervised UI: start/stop bracket the whole process. Today the try block only logs; once workflow
  // stories (e.g. STORY-013/014) land, real automation will run here while the panel stays up between
  // start and stop. Use supervised mode + integration-style runs to exercise the UI end-to-end.
  const supervisedUi = new SupervisedUI();
  registerSupervisedUi(supervisedUi);
  try {
    await supervisedUi.start();
    logger.info('ClinicHub runner started');
  } finally {
    await supervisedUi.stop();
    registerSupervisedUi(null);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
