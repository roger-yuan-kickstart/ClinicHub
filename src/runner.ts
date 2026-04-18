import { SupervisedUI, registerSupervisedUi } from './automation/supervisedUI';
import { config } from './config';
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
    if (config.supervisedMode && config.supervisedUiSmokeHoldMs > 0) {
      logger.info(
        { ms: config.supervisedUiSmokeHoldMs },
        'Supervised UI smoke hold: keeping local panel server open; open http://127.0.0.1:' +
          String(config.supervisedUiPort) +
          ' in a browser (set SUPERVISED_UI_SMOKE_HOLD_MS=0 to skip)',
      );
      await new Promise<void>((resolve) => {
        setTimeout(resolve, config.supervisedUiSmokeHoldMs);
      });
    }
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
