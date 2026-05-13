/**
 * Centralizes backend URL resolution so every future transport uses the same
 * environment contract.
 */
export function getBackendUrl() {
  return (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8000').replace(/\/$/, '');
}

