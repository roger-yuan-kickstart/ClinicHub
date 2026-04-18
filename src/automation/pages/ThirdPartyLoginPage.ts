import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BrowserContext, Page } from 'playwright';
import { safeClick, safeFill } from '../dryRun';
import { logger } from '../../logger';
import type { TaskConfig } from '../../types';

const POST_LOGIN_WAIT_MS = 30_000;
const IS_LOGGED_IN_PROBE_MS = 5_000;

/**
 * Third-party clinic system login page (Page Object).
 * Selectors are placeholders until STORY-012 captures real ones.
 */
export class ThirdPartyLoginPage {
  private readonly page: Page;

  private readonly context: BrowserContext;

  private readonly config: TaskConfig;

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly usernameInputSelector = '[data-clinichub="third-party-login-username"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly passwordInputSelector = '[data-clinichub="third-party-login-password"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly loginButtonSelector = '[data-clinichub="third-party-login-submit"]';

  /** Visible only after successful login (placeholder marker). */
  private readonly postLoginRootSelector = '[data-clinichub="third-party-post-login-root"]';

  /** Optional error region on failed login (placeholder). */
  private readonly loginErrorSelector = '[data-clinichub="third-party-login-error"]';

  private static readonly windowLabel = 'ThirdParty';

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
        `Session state file not found: ${absolute}. Run loginFresh and saveSession first, or complete STORY-012 Session 0.`,
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

  async loginFresh(username: string, password: string): Promise<void> {
    await this.navigate();

    await safeFill(
      this.page,
      this.usernameInputSelector,
      username,
      'Third-party login username',
      ThirdPartyLoginPage.windowLabel,
    );
    await safeFill(
      this.page,
      this.passwordInputSelector,
      password,
      'Third-party login password',
      ThirdPartyLoginPage.windowLabel,
    );
    await safeClick(
      this.page,
      this.loginButtonSelector,
      'Third-party login submit',
      ThirdPartyLoginPage.windowLabel,
    );

    if (this.config.dryRun) {
      logger.info('DRY_RUN: login form actions were skipped; not waiting for post-login marker');
      return;
    }

    try {
      await this.page.locator(this.postLoginRootSelector).first().waitFor({
        state: 'visible',
        timeout: POST_LOGIN_WAIT_MS,
      });
    } catch {
      const errorLocator = this.page.locator(this.loginErrorSelector).first();
      const errorVisible = await errorLocator.isVisible().catch(() => false);
      if (errorVisible) {
        const text = (await errorLocator.innerText().catch(() => '')).trim();
        throw new Error(
          `Third-party login failed: error banner visible${text.length > 0 ? `: ${text}` : ''}`,
        );
      }
      throw new Error(
        'Third-party login failed: post-login marker not visible within timeout (selectors may need STORY-012 capture).',
      );
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
