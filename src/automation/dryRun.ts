import { createInterface } from 'node:readline';
import type { Page } from 'playwright';
import { config } from '../config';
import { logger } from '../logger';

function logDryRun(message: string): void {
  logger.info(`[DRY-RUN] ${message}`);
}

/**
 * When DRY_RUN is true, returns false immediately (no prompt).
 * When DRY_RUN is false, prints the action description and waits for the user to type "yes".
 */
export async function confirmAction(description: string): Promise<boolean> {
  if (config.dryRun) {
    logDryRun(`Skipping confirmation prompt: ${description}`);
    return false;
  }

  logger.info(`[Confirm action] ${description}`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return await new Promise<boolean>((resolve) => {
    rl.question('Type "yes" to continue, anything else to skip: ', (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'yes');
    });
  });
}

async function confirmStepIfNeeded(description: string): Promise<boolean> {
  if (!config.stepMode) {
    return true;
  }
  return confirmAction(`Step confirmation - ${description}`);
}

/**
 * Clicks an element when not in dry-run. Respects STEP_MODE (prompt before each write).
 */
export async function safeClick(page: Page, selector: string, description: string): Promise<void> {
  if (config.dryRun) {
    logDryRun(`Skip click: ${description} (selector: ${selector})`);
    return;
  }

  const proceed = await confirmStepIfNeeded(description);
  if (!proceed) {
    logger.info(`Skipped by user (step mode): ${description}`);
    return;
  }

  logger.info(`Clicking: ${description}`);
  await page.click(selector);
}

/**
 * Fills an input when not in dry-run. Respects STEP_MODE (prompt before each write).
 */
export async function safeFill(
  page: Page,
  selector: string,
  value: string,
  description: string,
): Promise<void> {
  if (config.dryRun) {
    logDryRun(`Skip fill: ${description} (selector: ${selector}, value: "${value}")`);
    return;
  }

  const proceed = await confirmStepIfNeeded(description);
  if (!proceed) {
    logger.info(`Skipped by user (step mode): ${description}`);
    return;
  }

  logger.info(`Filling field: ${description}`);
  await page.fill(selector, value);
}
