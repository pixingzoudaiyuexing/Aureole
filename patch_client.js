const fs = require('fs');

let clientTs = fs.readFileSync('src/lib/api/client.ts', 'utf8');

clientTs = clientTs.replace(
  `export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL,
  fetchImpl = fetch,
}: ApiClientOptions = {}) {`,
  `function resolveApiOrigin(configuredUrl?: string): string | undefined {
  if (configuredUrl) {
    try {
      const parsed = new URL(configuredUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return undefined; // Invalid protocol
      }
      if (parsed.username || parsed.password) {
        return undefined; // No credential-bearing URLs allowed
      }
      return parsed.origin;
    } catch {
      return undefined;
    }
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    return window.location.origin;
  }
  return undefined;
}

export function createApiClient({
  baseUrl = import.meta.env.VITE_API_BASE_URL,
  fetchImpl = fetch,
}: ApiClientOptions = {}) {
  const resolvedBaseUrl = resolveApiOrigin(baseUrl);
`
);

clientTs = clientTs.replace(
  `    if (!baseUrl) {
      throw new ApiError({`,
  `    if (!resolvedBaseUrl) {
      throw new ApiError({`
);

clientTs = clientTs.replace(
  `response = await fetchImpl(new URL(path, baseUrl), {`,
  `response = await fetchImpl(new URL(path, resolvedBaseUrl), {`
);

fs.writeFileSync('src/lib/api/client.ts', clientTs);
