import type { Page } from 'playwright';
import { safeClick, safeFill } from '../dryRun';
import { logger } from '../../logger';
import type { TaskConfig } from '../../types';

const IS_LOGGED_IN_PROBE_MS = 5_000;
const COMPOSE_ELEMENT_WAIT_MS = 30_000;

export interface WebMailComposeEmailInput {
  subject: string;
  body: string;
}

/**
 * Webmail compose flow (Page Object).
 * Selectors are placeholders until STORY-012 captures real ones.
 */
export class WebMailComposePage {
  private readonly page: Page;

  private readonly config: TaskConfig;

  /** Visible after successful login (placeholder shell marker). */
  private readonly postLoginRootSelector = '[data-clinichub="webmail-post-login-root"]';

  /** Opens a new compose surface when landing on inbox-style chrome (placeholder). */
  private readonly newMessageButtonSelector = '[data-clinichub="webmail-compose-new"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly subjectInputSelector = '[data-clinichub="webmail-compose-subject"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly bodyInputSelector = '[data-clinichub="webmail-compose-body"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly sendButtonSelector = '[data-clinichub="webmail-compose-send"]';

  private static readonly windowLabel = 'Webmail';

  constructor(page: Page, config: TaskConfig) {
    this.page = page;
    this.config = config;
  }

  /**
   * Assumes the Webmail UI was opened by the third-party workflow (popup or redirect).
   * Does not navigate or perform credential login.
   */
  async navigate(): Promise<void> {
    logger.info(
      'WebMailComposePage: assuming webmail page is already open from the third-party flow',
    );
  }

  /**
   * Fills subject and body. Recipient is expected to be set by the third-party integration.
   */
  async composeEmail(input: WebMailComposeEmailInput): Promise<void> {
    // ensureComposeSurfaceReady ends with requireVisibleLocator (a real waitFor). In dry-run,
    // safeFill/safeClick no-op, so the compose UI never appears and the wait would time out on placeholders.
    if (!this.config.dryRun) {
      await this.ensureComposeSurfaceReady();
    } else {
      logger.info('[DRY-RUN] Skipping compose UI readiness wait');
    }

    await safeFill(
      this.page,
      this.subjectInputSelector,
      input.subject,
      'Webmail compose subject',
      WebMailComposePage.windowLabel,
    );
    await safeFill(
      this.page,
      this.bodyInputSelector,
      input.body,
      'Webmail compose body',
      WebMailComposePage.windowLabel,
    );
  }

  /** Clicks the send control through dry-run-aware helpers. */
  async sendEmail(): Promise<void> {
    await safeClick(
      this.page,
      this.sendButtonSelector,
      'Webmail send message',
      WebMailComposePage.windowLabel,
    );
  }

  /**
   * Returns whether the post-login shell marker is visible (short probe), for session checks without navigate/login.
   */
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

  private async ensureComposeSurfaceReady(): Promise<void> {
    await safeClick(
      this.page,
      this.newMessageButtonSelector,
      'Webmail open new message',
      WebMailComposePage.windowLabel,
    );
    await this.requireVisibleLocator(this.subjectInputSelector, 'compose subject field');
  }

  private async requireVisibleLocator(selector: string, fieldLabel: string): Promise<void> {
    const locator = this.page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: COMPOSE_ELEMENT_WAIT_MS });
    } catch {
      throw new Error(
        `WebMailComposePage: ${fieldLabel} not visible or missing within timeout, selector: ${selector}`,
      );
    }
  }
}
