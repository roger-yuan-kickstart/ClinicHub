import fs from 'fs';
import path from 'path';
import type { Page } from 'playwright';
import { config } from '../config';
import { logger } from '../logger';

function formatLocalTimestamp(reference: Date): string {
  const year = reference.getFullYear();
  const month = String(reference.getMonth() + 1).padStart(2, '0');
  const day = String(reference.getDate()).padStart(2, '0');
  const hours = String(reference.getHours()).padStart(2, '0');
  const minutes = String(reference.getMinutes()).padStart(2, '0');
  const seconds = String(reference.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

function sanitizeStepName(stepName: string): string {
  const withoutControlChars = [...stepName]
    .map((ch) => {
      const code = ch.charCodeAt(0);
      return code < 32 || code === 127 ? '_' : ch;
    })
    .join('');
  const withoutFsUnsafe = withoutControlChars.replace(/[/\\:*?"<>|]/g, '_');
  const trimmed = withoutFsUnsafe.trim().replace(/^\.+/, '');
  return trimmed === '' ? 'step' : trimmed;
}

/**
 * Saves a full-page PNG under {@link config.screenshotDir} with a sortable timestamp prefix.
 * Failures are logged at warn level and never thrown, so workflows keep running.
 */
export async function screenshot(page: Page, stepName: string): Promise<void> {
  const dir = path.resolve(config.screenshotDir);
  const safeStep = sanitizeStepName(stepName);
  const fileName = `${formatLocalTimestamp(new Date())}_${safeStep}.png`;
  const filePath = path.join(dir, fileName);

  try {
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: filePath, type: 'png', fullPage: true });
    logger.info({ filePath }, 'Screenshot saved');
  } catch (err: unknown) {
    logger.warn({ err }, 'Screenshot capture failed');
  }
}
