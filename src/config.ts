import dotenv from 'dotenv';
import type { PinoLogLevelString, TaskConfig } from './types';

dotenv.config();

const REQUIRED_ENV_KEYS = ['THIRD_PARTY_URL'] as const;

const PINO_LOG_LEVELS: readonly PinoLogLevelString[] = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
];

type RequiredEnvKey = (typeof REQUIRED_ENV_KEYS)[number];

export type ClinicHubConfig = TaskConfig;

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

function parsePort(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Invalid port for ${key}: ${raw}`);
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid port for ${key}: ${raw}`);
  }
  return parsed;
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
  for (const level of PINO_LOG_LEVELS) {
    if (level === normalized) {
      return level;
    }
  }
  const allowed = PINO_LOG_LEVELS.join(', ');
  throw new Error(`Invalid log level for ${key}: ${raw}. Expected one of: ${allowed}`);
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

function buildConfig(): TaskConfig {
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
    supervisedUiPort: parsePort('SUPERVISED_UI_PORT', 7788),
    supervisedUiSmokeHoldMs: parseNonNegativeInt('SUPERVISED_UI_SMOKE_HOLD_MS', 0),
    slowMoMs: parseNonNegativeInt('SLOW_MO_MS', 500),
    screenshotDir: readOptionalString('SCREENSHOT_DIR', './screenshots'),
    logDir: readOptionalString('LOG_DIR', './logs'),
    sessionStatePath: readOptionalString('SESSION_STATE_PATH', './recordings/auth.json'),
    logLevel: parseLogLevel('LOG_LEVEL', 'info'),
    thirdPartyUrl: readTrimmed('THIRD_PARTY_URL')!,
  };
}

export const config: ClinicHubConfig = buildConfig();
