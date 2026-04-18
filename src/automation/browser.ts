import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '../logger';
import type { TaskConfig } from '../types';

/**
 * Desktop Chrome UA string (not Playwright's default), to reduce automation fingerprinting.
 */
const CHROME_DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 720;

export interface PlaywrightBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface BrowserCloseHandles {
  browser: Browser;
  context: BrowserContext;
}

/**
 * Launches Chromium with task settings, a single context (custom UA + viewport), and one page.
 */
export async function createBrowserContext(config: TaskConfig): Promise<PlaywrightBrowserSession> {
  try {
    const browser = await chromium.launch({
      headless: config.browserHeadless,
      slowMo: config.slowMoMs,
    });

    const context = await browser.newContext({
      userAgent: CHROME_DESKTOP_USER_AGENT,
      viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    });

    const page = await context.newPage();

    logger.info(
      {
        headless: config.browserHeadless,
        slowMoMs: config.slowMoMs,
        viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
      },
      'Playwright browser started successfully',
    );

    return { browser, context, page };
  } catch (err) {
    logger.error(err, 'Playwright browser failed to start');
    throw err;
  }
}

/**
 * Closes the browser context and browser process; logs but does not rethrow close errors.
 */
export async function closeBrowser(handles: BrowserCloseHandles): Promise<void> {
  const { context, browser } = handles;
  try {
    await context.close();
  } catch (err) {
    logger.error(err, 'Error while closing Playwright browser context');
  }
  try {
    await browser.close();
  } catch (err) {
    logger.error(err, 'Error while closing Playwright browser');
  }
}
