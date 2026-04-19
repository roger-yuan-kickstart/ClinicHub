/**
 * One-shot CLI: open a visible browser, navigate to the third-party URL, wait for manual login,
 * then persist Playwright storage state to SESSION_STATE_PATH.
 */

import { closeBrowser, createBrowserContext } from '../automation/browser';
import { ThirdPartyLoginPage } from '../automation/pages/ThirdPartyLoginPage';
import { config } from '../config';
import { logger } from '../logger';

async function main(): Promise<void> {
  const sessionConfig = { ...config, browserHeadless: false, dryRun: false };
  const session = await createBrowserContext(sessionConfig);
  try {
    const loginPage = new ThirdPartyLoginPage(session.page, session.context, sessionConfig);
    await loginPage.navigate();
    logger.info(
      'Please log in manually. Playwright will save your session automatically once login is detected.',
    );
    await loginPage.waitForManualLogin();
    const savedPath = await loginPage.saveSession(sessionConfig.sessionStatePath);
    logger.info(`Session saved to ${savedPath}. You can now run 'pnpm start'.`);
  } finally {
    await closeBrowser({ browser: session.browser, context: session.context });
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
