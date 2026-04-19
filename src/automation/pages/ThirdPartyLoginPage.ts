import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { logger } from '../../logger';
import type { TaskConfig } from '../../types';

/** Interval between manual-login polls (story: every 2 seconds). */
const MANUAL_LOGIN_POLL_MS = 2_000;
/** Short probe so each poll completes quickly while the user is not yet logged in. */
const MANUAL_LOGIN_PROBE_MS = 1_000;
const IS_LOGGED_IN_PROBE_MS = 5_000;
/** Reminder log if login is still pending (UX; not configurable). */
const MANUAL_LOGIN_REMINDER_MS = 300_000;

/**
 * Third-party clinic system login page (Page Object).
 * Selectors are placeholders until STORY-012 captures real ones.
 */
export class ThirdPartyLoginPage {
  /** Window label for supervised UI and multi-window logs (STORY-004b / STORY-013). */
  static readonly windowLabel = 'ThirdParty';

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

  async saveSession(path: string): Promise<string> {
    const absolute = resolve(path);
    await mkdir(dirname(absolute), { recursive: true });
    await this.context.storageState({ path: absolute });
    logger.info({ path: absolute }, 'Saved Playwright storage state');
    return absolute;
  }

  /**
   * Waits until the user signs in manually in the browser (polls {@link isLoggedIn}).
   */
  async waitForManualLogin(): Promise<void> {
    if (this.config.dryRun) {
      logger.info('[DRY-RUN] Manual login wait skipped');
      return;
    }

    const timeoutMs = this.config.manualLoginTimeoutMs;
    logger.info(
      {
        windowLabel: ThirdPartyLoginPage.windowLabel,
        timeoutMs: timeoutMs === 0 ? 'unlimited' : timeoutMs,
        pollMs: MANUAL_LOGIN_POLL_MS,
      },
      'Waiting for manual login. Press Ctrl+C to abort.',
    );

    const start = Date.now();
    let lastReminder = start;

    for (;;) {
      if (await this.isLoggedIn(MANUAL_LOGIN_PROBE_MS)) {
        return;
      }
      const now = Date.now();
      if (timeoutMs > 0 && now - start >= timeoutMs) {
        throw new Error(
          `Manual login timed out after ${timeoutMs} ms. Sign in in the browser, or set MANUAL_LOGIN_TIMEOUT_MS=0 for no limit.`,
        );
      }
      if (now - lastReminder >= MANUAL_LOGIN_REMINDER_MS) {
        logger.warn(
          { windowLabel: ThirdPartyLoginPage.windowLabel },
          'Still waiting for manual login. Complete sign-in in the browser, or press Ctrl+C to abort.',
        );
        lastReminder = now;
      }
      await new Promise<void>((r) => {
        setTimeout(r, MANUAL_LOGIN_POLL_MS);
      });
    }
  }

  async isLoggedIn(probeTimeoutMs: number = IS_LOGGED_IN_PROBE_MS): Promise<boolean> {
    try {
      await this.page.locator(this.postLoginRootSelector).first().waitFor({
        state: 'visible',
        timeout: probeTimeoutMs,
      });
      return true;
    } catch {
      return false;
    }
  }
}
