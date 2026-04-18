import type { Logger } from 'pino';
import type { Page } from 'playwright';

/** Pino log level strings accepted by ClinicHub configuration. */
export type PinoLogLevelString =
  | 'trace'
  | 'debug'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal';

/**
 * Runtime configuration for a single automation task (credentials, safety switches,
 * output paths, Playwright-related settings).
 */
export interface TaskConfig {
  dryRun: boolean;
  stepMode: boolean;
  browserHeadless: boolean;
  supervisedMode: boolean;
  supervisedUiPort: number;
  /** When supervised mode is on, optional delay before runner shutdown (preview panel). */
  supervisedUiSmokeHoldMs: number;
  slowMoMs: number;
  screenshotDir: string;
  logDir: string;
  sessionStatePath: string;
  logLevel: PinoLogLevelString;
  thirdPartyUrl: string;
  thirdPartyUsername: string;
  thirdPartyPassword: string;
  webmailUrl: string;
  webmailUsername: string;
  webmailPassword: string;
  testEmailRecipient: string;
}

/**
 * Patient report data extracted from the third-party system (list row or detail page).
 */
export interface PatientReport {
  id: string;
  patientId: string;
  reportContent: string;
  replyContent: string;
  patientName?: string;
  reportTitle?: string;
  status?: string;
  reportDate?: string;
}

/** Outcome of a workflow or batch run. */
export interface TaskResult {
  success: boolean;
  processedCount: number;
  errors: string[];
}

/** Bundled dependencies passed through workflow steps and Page Objects. */
export interface StepContext {
  page: Page;
  config: TaskConfig;
  logger: Logger;
}
