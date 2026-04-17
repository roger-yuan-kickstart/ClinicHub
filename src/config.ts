import dotenv from 'dotenv';

dotenv.config();

const REQUIRED_ENV_KEYS = [
  'THIRD_PARTY_URL',
  'THIRD_PARTY_USERNAME',
  'THIRD_PARTY_PASSWORD',
  'WEBMAIL_URL',
  'WEBMAIL_USERNAME',
  'WEBMAIL_PASSWORD',
  'TEST_EMAIL_RECIPIENT',
] as const;

const PINO_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];
type PinoLogLevelString = (typeof PINO_LOG_LEVELS)[number];

export interface ClinicHubConfig {
  dryRun: boolean;
  stepMode: boolean;
  browserHeadless: boolean;
  supervisedMode: boolean;
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

function readTrimmed(key: string): string | undefined {
  const value = process.env[key];
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function parseBooleanEnv(key: string, defaultValue: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value for ${key}. Expected true/false, got: ${raw}`);
}

function parseNonNegativeInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid non-negative integer for ${key}: ${raw}`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer for ${key}: ${raw}`);
  }
  return parsed;
}

function readOptionalString(key: string, defaultValue: string): string {
  return readTrimmed(key) ?? defaultValue;
}

function parseLogLevel(key: string, defaultValue: PinoLogLevelString): PinoLogLevelString {
  const raw = readTrimmed(key);
  if (raw === undefined) {
    return defaultValue;
  }
  const normalized = raw.toLowerCase();
  if (!(PINO_LOG_LEVELS as readonly string[]).includes(normalized)) {
    const allowed = PINO_LOG_LEVELS.join(', ');
    throw new Error(`Invalid log level for ${key}: ${raw}. Expected one of: ${allowed}`);
  }
  return normalized as PinoLogLevelString;
}

function collectMissingRequiredKeys(): RequiredEnvKey[] {
  const missing: RequiredEnvKey[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    if (readTrimmed(key) === undefined) {
      missing.push(key);
    }
  }
  return missing;
}

function buildConfig(): ClinicHubConfig {
  const missing = collectMissingRequiredKeys();
  if (missing.length > 0) {
    const sorted = [...missing].sort().join(', ');
    throw new Error(`Missing required environment variables: ${sorted}`);
  }

  return {
    dryRun: parseBooleanEnv('DRY_RUN', true),
    stepMode: parseBooleanEnv('STEP_MODE', false),
    browserHeadless: parseBooleanEnv('BROWSER_HEADLESS', false),
    supervisedMode: parseBooleanEnv('SUPERVISED_MODE', false),
    slowMoMs: parseNonNegativeInt('SLOW_MO_MS', 500),
    screenshotDir: readOptionalString('SCREENSHOT_DIR', './screenshots'),
    logDir: readOptionalString('LOG_DIR', './logs'),
    sessionStatePath: readOptionalString('SESSION_STATE_PATH', './recordings/auth.json'),
    logLevel: parseLogLevel('LOG_LEVEL', 'info'),
    thirdPartyUrl: readTrimmed('THIRD_PARTY_URL')!,
    thirdPartyUsername: readTrimmed('THIRD_PARTY_USERNAME')!,
    thirdPartyPassword: readTrimmed('THIRD_PARTY_PASSWORD')!,
    webmailUrl: readTrimmed('WEBMAIL_URL')!,
    webmailUsername: readTrimmed('WEBMAIL_USERNAME')!,
    webmailPassword: readTrimmed('WEBMAIL_PASSWORD')!,
    testEmailRecipient: readTrimmed('TEST_EMAIL_RECIPIENT')!,
  };
}

export const config: ClinicHubConfig = buildConfig();
