import type { Page } from 'playwright';
import { safeClick, safeFill } from '../dryRun';
import { logger } from '../../logger';
import type { TaskConfig } from '../../types';

const POST_LOGIN_WAIT_MS = 30_000;
const IS_LOGGED_IN_PROBE_MS = 5_000;
const COMPOSE_ELEMENT_WAIT_MS = 30_000;

export interface WebMailComposeEmailInput {
  to: string;
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

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly usernameInputSelector = '[data-clinichub="webmail-login-username"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly passwordInputSelector = '[data-clinichub="webmail-login-password"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly loginButtonSelector = '[data-clinichub="webmail-login-submit"]';

  /** Visible after successful login (placeholder shell marker). */
  private readonly postLoginRootSelector = '[data-clinichub="webmail-post-login-root"]';

  /** Optional error region on failed login (placeholder). */
  private readonly loginErrorSelector = '[data-clinichub="webmail-login-error"]';

  /** Opens a new compose surface when landing on inbox-style chrome (placeholder). */
  private readonly newMessageButtonSelector = '[data-clinichub="webmail-compose-new"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly toInputSelector = '[data-clinichub="webmail-compose-to"]';

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
   * Opens the webmail entry URL and completes credential login when no active session is detected.
   */
  async navigate(): Promise<void> {
    const { webmailUrl } = this.config;
    logger.info({ webmailUrl }, 'Navigating to webmail');
    await this.page.goto(webmailUrl, { waitUntil: 'load' });
    logger.info({ webmailUrl }, 'Webmail entry page load finished');

    const loggedIn = await this.isLoggedIn();
    if (loggedIn) {
      logger.info({ webmailUrl }, 'Webmail session already active');
      return;
    }

    await this.loginFresh();
  }

  /**
   * Fills recipient, subject, and body. Enforces TEST_EMAIL_RECIPIENT when dry-run is on or a
   * non-empty sandbox recipient is configured (see Phase 1 safety model in docs).
   */
  async composeEmail(input: WebMailComposeEmailInput): Promise<void> {
    const recipient = this.resolveSandboxRecipient(input.to);

    if (!this.config.dryRun) {
      await this.ensureComposeSurfaceReady();
    } else {
      logger.info('[DRY-RUN] Skipping compose UI readiness wait');
    }

    await safeFill(
      this.page,
      this.toInputSelector,
      recipient,
      'Webmail compose recipient',
      WebMailComposePage.windowLabel,
    );
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

  private resolveSandboxRecipient(requestedTo: string): string {
    const requested = requestedTo.trim();
    const testRecipient = this.config.testEmailRecipient.trim();
    const mustUseSandbox = this.config.dryRun || testRecipient !== '';

    if (!mustUseSandbox) {
      return requested;
    }

    if (requested !== testRecipient) {
      logger.warn(
        { requestedTo: requested, testEmailRecipient: testRecipient },
        '\u26a0\ufe0f Recipient overridden to TEST_EMAIL_RECIPIENT (sandbox protection)',
      );
    }

    return testRecipient;
  }

  private async ensureComposeSurfaceReady(): Promise<void> {
    await safeClick(
      this.page,
      this.newMessageButtonSelector,
      'Webmail open new message',
      WebMailComposePage.windowLabel,
    );
    await this.requireVisibleLocator(this.toInputSelector, 'compose recipient field');
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

  private async isLoggedIn(): Promise<boolean> {
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

  private async loginFresh(): Promise<void> {
    await safeFill(
      this.page,
      this.usernameInputSelector,
      this.config.webmailUsername,
      'Webmail login username',
      WebMailComposePage.windowLabel,
    );
    await safeFill(
      this.page,
      this.passwordInputSelector,
      this.config.webmailPassword,
      'Webmail login password',
      WebMailComposePage.windowLabel,
    );
    await safeClick(
      this.page,
      this.loginButtonSelector,
      'Webmail login submit',
      WebMailComposePage.windowLabel,
    );

    if (this.config.dryRun) {
      logger.info('DRY_RUN: webmail login actions were skipped; not waiting for post-login marker');
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
          `Webmail login failed: error banner visible${text.length > 0 ? `: ${text}` : ''}`,
        );
      }
      throw new Error(
        'Webmail login failed: post-login marker not visible within timeout (selectors may need STORY-012 capture).',
      );
    }
  }
}
