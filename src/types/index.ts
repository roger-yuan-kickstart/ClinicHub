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
 * Runtime configuration for a single automation task (safety switches, output paths,
 * Playwright-related settings). Credentials are never stored; session state is loaded from disk.
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
}

/**
 * Patient report data extracted from the third-party system (list row or detail page).
 * `replyContent` is absent until a reply exists (list rows may omit it; use detail page to fill).
 */
export interface PatientReport {
  id: string;
  patientId: string;
  reportContent: string;
  replyContent?: string;
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

/**
 * Bundled dependencies passed through workflow steps and Page Objects.
 * Phase 1 couples this to Playwright's `Page`; if non-automation code imports shared types later,
 * split or generalize (e.g. `StepContext<TPage>`) rather than widening `../types`.
 */
export interface StepContext {
  page: Page;
  config: TaskConfig;
  logger: Logger;
}
