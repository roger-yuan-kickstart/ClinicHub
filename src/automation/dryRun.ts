import { createInterface } from 'node:readline';
import type { Page } from 'playwright';
import { config } from '../config';
import { logger } from '../logger';
import { getRegisteredSupervisedUi, type SupervisedConfirmationStep } from './supervisedUI';

const SUPERVISED_PLACEHOLDER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

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
  // STEP_MODE prompts only when DRY_RUN is false: safeClick/safeFill return on dry-run before this runs.
  if (!config.stepMode) {
    return true;
  }
  return confirmAction(`Step confirmation - ${description}`);
}

async function supervisedConfirmBeforeWrite(
  page: Page,
  selector: string,
  description: string,
  windowLabel?: string,
): Promise<boolean> {
  if (!config.supervisedMode) {
    return true;
  }

  const ui = getRegisteredSupervisedUi();
  if (!ui) {
    logger.warn(
      'SUPERVISED_MODE is enabled but no SupervisedUI instance was registered; proceeding without UI confirmation',
    );
    return true;
  }

  let screenshotBase64 = SUPERVISED_PLACEHOLDER_PNG_BASE64;
  try {
    const buffer = await page.screenshot({ type: 'png' });
    screenshotBase64 = buffer.toString('base64');
  } catch (err) {
    logger.warn({ err }, 'Supervised UI screenshot failed; using placeholder image');
  }

  let targetRect: SupervisedConfirmationStep['targetRect'];
  try {
    const box = await page.locator(selector).first().boundingBox();
    if (box) {
      targetRect = { x: box.x, y: box.y, width: box.width, height: box.height };
    }
  } catch (err) {
    logger.warn({ err }, 'Supervised UI could not read element bounding box');
  }

  const decision = await ui.requestConfirmation({
    description,
    screenshotBase64,
    targetRect,
    windowLabel,
  });

  return decision === 'confirm';
}

/**
 * Clicks an element when not in dry-run. Respects STEP_MODE (prompt before each write).
 * @param windowLabel Optional label for the supervised UI panel (e.g. target browser context name).
 */
export async function safeClick(
  page: Page,
  selector: string,
  description: string,
  windowLabel?: string,
): Promise<void> {
  if (config.dryRun) {
    logDryRun(`Skip click: ${description} (selector: ${selector})`);
    return;
  }

  const supervisedOk = await supervisedConfirmBeforeWrite(page, selector, description, windowLabel);
  if (!supervisedOk) {
    logger.info(`Skipped by user (supervised UI): ${description}`);
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
 * @param windowLabel Optional label for the supervised UI panel (e.g. target browser context name).
 */
export async function safeFill(
  page: Page,
  selector: string,
  value: string,
  description: string,
  windowLabel?: string,
): Promise<void> {
  if (config.dryRun) {
    logDryRun(`Skip fill: ${description} (selector: ${selector}, value: [REDACTED])`);
    return;
  }

  const supervisedOk = await supervisedConfirmBeforeWrite(page, selector, description, windowLabel);
  if (!supervisedOk) {
    logger.info(`Skipped by user (supervised UI): ${description}`);
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
