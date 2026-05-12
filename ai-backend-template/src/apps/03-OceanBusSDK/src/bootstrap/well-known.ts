/**
 * Bootstrap L1 service addresses from a well-known URL.
 *
 * Every OceanBus server can host a static JSON file at:
 *   /.well-known/oceanbus-services.json
 *
 * Format:
 *   { "yellow_pages": "<openid>", "reputation": "<openid>" }
 *
 * SDK fetches this on startup. On success, uses the server-provided addresses.
 * On failure, falls back to built-in defaults (offline cache).
 */

export interface WellKnownServices {
  yellow_pages: string;
  reputation: string;
}

const WELL_KNOWN_PATH = '/.well-known/oceanbus-services.json';

/** Strip the L0 API path to get the server root, then append well-known path. */
function wellKnownUrl(baseUrl: string): string {
  const root = baseUrl.replace(/\/api\/l0\/?$/, '');
  return root + WELL_KNOWN_PATH;
}

/**
 * Fetch L1 service addresses from the well-known URL.
 * Returns null on any failure — caller falls back to defaults.
 */
export async function fetchWellKnown(baseUrl: string): Promise<WellKnownServices | null> {
  try {
    const url = wellKnownUrl(baseUrl);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = await response.json() as Record<string, unknown>;
    if (typeof data.yellow_pages === 'string' && typeof data.reputation === 'string') {
      return { yellow_pages: data.yellow_pages, reputation: data.reputation };
    }
    return null;
  } catch {
    return null;
  }
}
