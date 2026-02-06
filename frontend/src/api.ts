/**
 * Resolves the base URL for API calls.
 * When running inside HA ingress, the browser URL contains the ingress path.
 * All fetch calls should use `apiUrl("/api/...")` instead of hardcoded "/api/...".
 */

function getBasePath(): string {
  // In HA ingress the page is served under /api/hassio/ingress/<token>/
  // We detect this from the current page URL.
  const match = window.location.pathname.match(/^(\/api\/hassio\/ingress\/[^/]+)/);
  if (match) {
    return match[1];
  }
  return "";
}

const BASE_PATH = getBasePath();

export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`;
}

export function wsUrl(path: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${BASE_PATH}${path}`;
}
