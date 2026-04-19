import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { logger } from '../../logger';
import type { TaskConfig } from '../../types';

const MANUAL_LOGIN_POLL_MS = 2_000;
const IS_LOGGED_IN_PROBE_MS = 5_000;

/**
 * Third-party clinic system login page (Page Object).
 * Selectors are placeholders until STORY-012 captures real ones.
 */
export class ThirdPartyLoginPage {
  private readonly page: Page;

  private readonly context: BrowserContext;

  private readonly config: TaskConfig;

  /** Visible only after successful login (placeholder marker). */
  private readonly postLoginRootSelector = '[data-clinichub="third-party-post-login-root"]';

  constructor(page: Page, context: BrowserContext, config: TaskConfig) {
    this.page = page;
    this.context = context;
    this.config = config;
  }

  async navigate(): Promise<void> {
    const { thirdPartyUrl } = this.config;
    logger.info({ thirdPartyUrl }, 'Navigating to third-party system');
    await this.page.goto(thirdPartyUrl, { waitUntil: 'load' });
    logger.info({ thirdPartyUrl }, 'Third-party entry page load finished');
  }

  /**
   * Requires session file on disk and a BrowserContext created with that storageState.
   * Validates the file, then navigates to the third-party entry for isLoggedIn checks.
   */
  async restoreSession(path: string): Promise<void> {
    const absolute = resolve(path);
    if (!existsSync(absolute)) {
      throw new Error(
        `Session state file not found: ${absolute}. Run pnpm setup-session first, or complete STORY-012 Session 0.`,
      );
    }
    await this.navigate();
    logger.info(
      { sessionStatePath: absolute, thirdPartyUrl: this.config.thirdPartyUrl },
      'Session state file present; third-party entry page loaded for login probe',
    );
  }

  async saveSession(path: string): Promise<void> {
    const absolute = resolve(path);
    await mkdir(dirname(absolute), { recursive: true });
    await this.context.storageState({ path: absolute });
    logger.info({ path: absolute }, 'Saved Playwright storage state');
  }

  /**
   * Waits until the user signs in manually in the browser (polls {@link isLoggedIn}).
   */
  async waitForManualLogin(): Promise<void> {
    if (this.config.dryRun) {
      logger.info('[DRY-RUN] Manual login wait skipped');
      return;
    }

    logger.info('Waiting for manual login (polling every 2 seconds)...');

    for (;;) {
      if (await this.isLoggedIn()) {
        return;
      }
      await new Promise<void>((r) => {
        setTimeout(r, MANUAL_LOGIN_POLL_MS);
      });
    }
  }

  async isLoggedIn(): Promise<boolean> {
    try {
      await this.page.locator(this.postLoginRootSelector).first().waitFor({
        state: 'visible',
        timeout: IS_LOGGED_IN_PROBE_MS,
      });
      return true;
    } catch {
      return false;
    }
  }
}
