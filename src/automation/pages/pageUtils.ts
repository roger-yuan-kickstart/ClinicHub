import type { TaskConfig } from '../../types';

/**
 * Resolves a URL under the configured third-party base (`TaskConfig.thirdPartyUrl`).
 * Trims the base, ensures a trailing slash for correct `new URL(segment, base)` resolution,
 * then appends `segment` as the last path segment (same rules as a browser relative URL).
 */
export function resolveThirdPartyPath(config: TaskConfig, segment: string): string {
  const raw = config.thirdPartyUrl.trim();
  const base = raw.endsWith('/') ? raw : `${raw}/`;
  try {
    return new URL(segment, base).href;
  } catch {
    throw new Error(
      `resolveThirdPartyPath: invalid thirdPartyUrl for segment "${segment}": ${config.thirdPartyUrl}`,
    );
  }
}
