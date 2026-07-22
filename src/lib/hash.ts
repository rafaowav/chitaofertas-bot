import { createHash } from 'node:crypto';

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function offerHash(source: string, sourceId: string): string {
  return sha256(`${source}:${sourceId}`);
}

export function contentHash(data: Record<string, unknown>): string {
  return sha256(JSON.stringify(data, Object.keys(data).sort()));
}

export function titleHash(title: string): string {
  const normalized = title
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u1E00-\u1EFF\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return sha256(normalized);
}
