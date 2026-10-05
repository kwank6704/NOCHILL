export type RoastCategory = 'too_short' | 'too_long' | 'spam' | 'idle' | 'empty' | 'perfect' | 'done' | 'mash';
export type Roast = { id: number; category: RoastCategory; text: string; spice: number };
export type ItemKind = 'plate' | 'mug' | 'keyboard' | 'phone' | 'docs';
export type ShredStyle = 'strip' | 'cross' | 'confetti';

export type Totals = {
  sessions: number;
  itemsDestroyed: number;
  damageBaht: number;
  avgHoldMs: number;
  maxPressure: number;
  avgPressure: number;
  grievances: number;
  roasted: number;
  keystrokes: number;
};

export type Stats = {
  global: Totals;
  me: Totals | null;
  items: { item: ItemKind; count: number; price: number }[];
  daily: { day: string; rage: number; shredder: number; mash: number }[];
  pressure: number[];
  shame: { category: RoastCategory; n: number }[];
};

export type Grievance = { id: number; text: string; style: ShredStyle; createdAt: string };

export type SessionPayload =
  | { mode: 'rage'; holdMs: number; peakPressure: number; items: Partial<Record<ItemKind, number>> }
  | {
      mode: 'shredder';
      holdMs: number;
      peakPressure: number;
      grievance: { text: string; style: ShredStyle; isPublic: boolean };
    }
  | { mode: 'mash'; holdMs: number; peakPressure: number; keystrokes: number; keyboards: number };

export type SessionResult = { id: number; itemsDestroyed: number; damageBaht: number; roast: Roast | null };

const CLIENT_KEY = 'nochill:cid';

export function getClientId(): string {
  try {
    let id = localStorage.getItem(CLIENT_KEY);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, '');
      localStorage.setItem(CLIENT_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous_visitor';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export const api = {
  roasts: () => request<Partial<Record<RoastCategory, Roast[]>>>('/roasts'),
  logRoast: (category: RoastCategory) =>
    request('/roasts/events', { method: 'POST', body: JSON.stringify({ clientId: getClientId(), category }) }),
  saveSession: (payload: SessionPayload) =>
    request<SessionResult>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ ...payload, clientId: getClientId() }),
    }),
  stats: () => request<Stats>(`/stats?clientId=${encodeURIComponent(getClientId())}`),
  grievances: (limit = 24) => request<Grievance[]>(`/grievances?limit=${limit}`),
};
