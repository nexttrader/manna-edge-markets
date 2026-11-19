import { API_BASE } from '../config';

export interface ActiveSetupsResponse {
  ok: boolean;
  status: number;
  data: any;
}

const DEDUP_TTL_MS = 1500;

const inFlightRequests = new Map<string, Promise<ActiveSetupsResponse>>();
const recentCache = new Map<string, { ts: number; response: ActiveSetupsResponse }>();

export function invalidateActiveSetupsCache(): void {
  recentCache.clear();
}

export async function fetchActiveSetupsDeduped(
  role: string,
  email: string,
  force = false
): Promise<ActiveSetupsResponse> {
  const normalizedRole = (role || 'trader').trim();
  const normalizedEmail = (email || '').trim().toLowerCase();
  const key = `${normalizedRole}:${normalizedEmail}`;

  if (!force) {
    const cached = recentCache.get(key);
    if (cached && Date.now() - cached.ts < DEDUP_TTL_MS) {
      return cached.response;
    }

    const inFlight = inFlightRequests.get(key);
    if (inFlight) {
      return inFlight;
    }
  }

  const encodedEmail = encodeURIComponent(email);
  const requestPromise = (async (): Promise<ActiveSetupsResponse> => {
    const res = await fetch(
      `${API_BASE}/api/accelerate/active-setups?role=${encodeURIComponent(normalizedRole)}&email=${encodedEmail}`
    );
    const data = await res.json().catch(() => ({}));
    const response: ActiveSetupsResponse = {
      ok: res.ok,
      status: res.status,
      data
    };
    if (res.ok) {
      recentCache.set(key, { ts: Date.now(), response });
    }
    return response;
  })().finally(() => {
    if (inFlightRequests.get(key) === requestPromise) {
      inFlightRequests.delete(key);
    }
  });

  inFlightRequests.set(key, requestPromise);
  return requestPromise;
}
