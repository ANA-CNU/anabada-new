export type EventInput = {
  readonly title: string;
  readonly desc: string | null;
  readonly begin: string;
  readonly end: string;
  readonly problems: readonly number[];
};

export function parseEventInput(body: unknown, mode: 'create' | 'update'): EventInput | null {
  if (typeof body !== 'object' || body === null || !('title' in body) ||
      !('begin' in body) || !('end' in body)) return null;
  const { title, begin, end } = body;
  if (typeof title !== 'string' || !title.trim() || typeof begin !== 'string' ||
      !begin || typeof end !== 'string' || !end) return null;
  if (!Number.isFinite(Date.parse(begin)) || !Number.isFinite(Date.parse(end)) ||
      Date.parse(begin) > Date.parse(end)) return null;
  const desc = 'desc' in body ? body.desc : null;
  if (desc !== null && desc !== undefined && typeof desc !== 'string') return null;
  const raw = 'problems' in body ? body.problems : undefined;
  let problems: readonly number[];
  switch (mode) {
    case 'create':
      if (!Array.isArray(raw) || raw.length === 0 ||
          !raw.every((item: unknown): item is number => typeof item === 'number' && Number.isSafeInteger(item) && item > 0)) return null;
      problems = raw;
      break;
    case 'update':
      if (raw !== undefined && raw !== null && typeof raw !== 'string') return null;
      problems = typeof raw === 'string' && raw.trim() ? raw.split(',').map(item => Number(item.trim())) : [];
      if (!problems.every(item => Number.isSafeInteger(item) && item > 0)) return null;
      break;
  }
  return { title, desc: desc || null, begin, end, problems };
}

export function parseEventId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
