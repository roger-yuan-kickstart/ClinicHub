import type { Page } from 'playwright';
import { logger } from '../../logger';
import type { PatientReport, TaskConfig } from '../../types';
import { resolveThirdPartyPath } from './pageUtils';

const LIST_ROOT_WAIT_MS = 30_000;

/**
 * Third-party patient report list page (Page Object).
 * Selectors and list URL segment are placeholders until STORY-012 captures real ones.
 */
export class PatientReportListPage {
  private readonly page: Page;

  private readonly config: TaskConfig;

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly listRootSelector = '[data-clinichub="patient-report-list-root"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly reportRowSelector = '[data-clinichub="patient-report-row"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly rowReportIdSelector = '[data-clinichub="patient-report-row-id"]';

  /** Placeholder: replace after selector capture (STORY-012). */
  private readonly rowPatientIdSelector = '[data-clinichub="patient-report-row-patient-id"]';

  /** Appended under `thirdPartyUrl` (placeholder route). */
  private static readonly reportListPathSegment = 'patient-report-list';

  constructor(page: Page, config: TaskConfig) {
    this.page = page;
    this.config = config;
  }

  async navigate(): Promise<void> {
    const reportListUrl = resolveThirdPartyPath(this.config, PatientReportListPage.reportListPathSegment);
    logger.info({ reportListUrl }, 'Navigating to patient report list');
    await this.page.goto(reportListUrl, { waitUntil: 'load' });
    logger.info({ reportListUrl }, 'Patient report list page load finished');
  }

  /**
   * Reads all report rows under the list root. If the real UI lazy-loads rows after the
   * container paints, revisit empty detection after STORY-012 (e.g. wait for a row or an
   * explicit empty-state marker before treating zero rows as an empty list).
   */
  async getReportList(): Promise<PatientReport[]> {
    try {
      await this.page.locator(this.listRootSelector).first().waitFor({
        state: 'visible',
        timeout: LIST_ROOT_WAIT_MS,
      });
    } catch {
      throw new Error(
        `PatientReportListPage: report list root not visible, selector: ${this.listRootSelector}`,
      );
    }

    const rows = this.page.locator(this.reportRowSelector);
    const count = await rows.count();
    if (count === 0) {
      logger.info('No pending reports found on the patient report list page');
      return [];
    }

    const result: PatientReport[] = [];
    for (let i = 0; i < count; i += 1) {
      const row = rows.nth(i);
      const id = (await row.locator(this.rowReportIdSelector).first().innerText()).trim();
      const patientId = (await row.locator(this.rowPatientIdSelector).first().innerText()).trim();
      if (id === '' || patientId === '') {
        throw new Error(
          `PatientReportListPage: missing id or patientId in row ${i}, selectors: ${this.rowReportIdSelector}, ${this.rowPatientIdSelector}`,
        );
      }
      result.push({
        id,
        patientId,
        reportContent: '',
      });
    }
    return result;
  }
}
