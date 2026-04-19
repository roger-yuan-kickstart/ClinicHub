import type { Page } from 'playwright';
import { logger } from '../../logger';
import type { PatientReport, TaskConfig } from '../../types';
import { resolveThirdPartyPath } from './pageUtils';

/**
 * Default max wait for detail-page locators. Revisit after STORY-012 if real selectors or high
 * `SLOW_MO_MS` cause flakes; longer waits can also be introduced at workflow/playwright defaults later.
 */
const DETAIL_ELEMENT_WAIT_MS = 30_000;

/**
 * Third-party patient report detail page (Page Object).
 * Selectors and detail URL segment are placeholders until STORY-012 captures real ones.
 */
export class PatientReportDetailPage {
  private readonly page: Page;

  private readonly config: TaskConfig;

  /** Placeholder: replace after selector capture (STORY-012). Exposed for safeFill in workflows. */
  readonly replySelector = '[data-clinichub="patient-report-detail-reply"]';

  /** Placeholder: replace after selector capture (STORY-012). Exposed for safeClick in workflows. */
  readonly saveButtonSelector = '[data-clinichub="patient-report-detail-save"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly detailRootSelector = '[data-clinichub="patient-report-detail-root"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly reportIdSelector = '[data-clinichub="patient-report-detail-report-id"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly patientIdSelector = '[data-clinichub="patient-report-detail-patient-id"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly reportContentSelector = '[data-clinichub="patient-report-detail-content"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly reportTitleSelector = '[data-clinichub="patient-report-detail-title"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly patientNameSelector = '[data-clinichub="patient-report-detail-patient-name"]';

  private static readonly detailPathPrefix = 'patient-report-detail';

  constructor(page: Page, config: TaskConfig) {
    this.page = page;
    this.config = config;
  }

  /**
   * Navigates to the detail view for a report. URL is `thirdPartyUrl` + `patient-report-detail/{reportId}` (placeholder).
   */
  async open(reportId: string): Promise<void> {
    const trimmed = reportId.trim();
    if (trimmed === '') {
      throw new Error('PatientReportDetailPage.open: reportId must be non-empty');
    }
    const segment = `${PatientReportDetailPage.detailPathPrefix}/${encodeURIComponent(trimmed)}`;
    const reportDetailUrl = resolveThirdPartyPath(this.config, segment);
    logger.info({ reportDetailUrl, reportId: trimmed }, 'Navigating to patient report detail');
    await this.page.goto(reportDetailUrl, { waitUntil: 'load' });
    logger.info({ reportDetailUrl }, 'Patient report detail page load finished');
    await this.requireVisibleLocator(this.detailRootSelector, 'report detail root');
    logger.info({ reportDetailUrl }, 'Patient report detail root visible');
  }

  private async requireVisibleLocator(selector: string, fieldLabel: string) {
    const locator = this.page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout: DETAIL_ELEMENT_WAIT_MS });
    } catch {
      throw new Error(
        `PatientReportDetailPage: ${fieldLabel} not visible or missing within timeout, selector: ${selector}`,
      );
    }
    return locator;
  }

  /**
   * Reads report fields from the detail page. Throws a descriptive Error if required elements are missing.
   */
  async extractData(): Promise<PatientReport> {
    await this.requireVisibleLocator(this.detailRootSelector, 'report detail root');

    const idLocator = await this.requireVisibleLocator(this.reportIdSelector, 'report id');
    const patientIdLocator = await this.requireVisibleLocator(this.patientIdSelector, 'patient id');
    const contentLocator = await this.requireVisibleLocator(this.reportContentSelector, 'report content');
    const replyLocator = await this.requireVisibleLocator(this.replySelector, 'reply field');

    const id = (await idLocator.innerText()).trim();
    const patientId = (await patientIdLocator.innerText()).trim();
    const reportContent = (await contentLocator.innerText()).trim();
    const replyRaw = (await replyLocator.inputValue()).trim();
    const replyContent = replyRaw === '' ? undefined : replyRaw;

    if (id === '' || patientId === '') {
      throw new Error(
        `PatientReportDetailPage: extracted id or patientId is empty after read (report id selector: ${this.reportIdSelector}, patient id selector: ${this.patientIdSelector})`,
      );
    }

    const report: PatientReport = {
      id,
      patientId,
      reportContent,
      replyContent,
    };

    const titleLocator = this.page.locator(this.reportTitleSelector).first();
    if (await titleLocator.isVisible().catch(() => false)) {
      const title = (await titleLocator.innerText()).trim();
      if (title !== '') {
        report.reportTitle = title;
      }
    }

    const nameLocator = this.page.locator(this.patientNameSelector).first();
    if (await nameLocator.isVisible().catch(() => false)) {
      const patientName = (await nameLocator.innerText()).trim();
      if (patientName !== '') {
        report.patientName = patientName;
      }
    }

    return report;
  }
}
