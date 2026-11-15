import { Book, BookStatus, DiaryMood, DiaryPage, LibraryMeta } from '../types';

export function nid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function sanitizeId(raw: unknown): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || nid();
}

export function computeHue(seed: string): number {
  let h = 0;
  for (const ch of seed) {
    h = (h * 31 + ch.charCodeAt(0)) % 360;
  }
  return h;
}

export function dedupeKey(b: { t?: string; a?: string }): string {
  const norm = (v?: string) =>
    String(v || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  return `${norm(b.t)}|${norm(b.a)}`;
}

export function bookCompletenessScore(b: Book): number {
  return (
    (b.status ? 2 : 0) +
    (b.img ? 2 : 0) +
    (b.pdf ? 2 : 0) +
    (b.nt ? 1 : 0) +
    (b.rt ? 1 : 0) +
    (b.pg ? 1 : 0) +
    (b.a ? 1 : 0)
  );
}

export function getTodayDateTime(): [string, string] {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return [
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`,
    `${p(d.getHours())}:${p(d.getMinutes())}`,
  ];
}

const VALID_STATUSES = new Set<BookStatus>(['', 'want', 'reading', 'read']);
const VALID_MOODS = new Set<DiaryMood>([
  'good',
  'happy',
  'normal',
  'bad',
  'sad',
  'rainy',
  'worst',
  'best',
]);

export function sanitizeBook(raw: Partial<Book>, fallbackId?: string): Book {
  const id = sanitizeId(raw.id || fallbackId);
  const status: BookStatus = VALID_STATUSES.has(raw.status as BookStatus)
    ? (raw.status as BookStatus)
    : 'want';
  const rt = Math.min(5, Math.max(0, Math.round(Number(raw.rt) || 0)));
  const pt = Math.min(100000, Math.max(0, Math.round(Number(raw.pt) || 0)));
  const pg = Math.min(100000, Math.max(0, Math.round(Number(raw.pg) || 0)));
  const img =
    typeof raw.img === 'string' && raw.img.length <= 245000 ? raw.img : '';
  const pdf =
    typeof raw.pdf === 'string' ? raw.pdf.trim().slice(0, 2048) : '';

  return {
    id,
    t: String(raw.t || 'Untitled Book').trim().slice(0, 300) || 'Untitled Book',
    a: String(raw.a || '').trim().slice(0, 200),
    g: String(raw.g || '').trim().slice(0, 100),
    tp: String(raw.tp || '').trim().slice(0, 100),
    y: String(raw.y || '').trim().slice(0, 32),
    status,
    rt,
    pt,
    pg,
    nt: String(raw.nt || '').slice(0, 5000),
    img: img || undefined,
    pdf: pdf || undefined,
    ts: Number(raw.ts) > 0 ? Number(raw.ts) : Date.now(),
  };
}

export function sanitizeDiaryPage(raw: Partial<DiaryPage>, fallbackId?: string): DiaryPage {
  const id = sanitizeId(raw.id || fallbackId);
  const [todayDate, todayTime] = getTodayDateTime();
  const dateStr = String(raw.date || todayDate).trim().slice(0, 20);
  const mood: DiaryMood = VALID_MOODS.has(raw.mood as DiaryMood)
    ? (raw.mood as DiaryMood)
    : 'normal';

  return {
    id,
    date: dateStr.length >= 4 ? dateStr : todayDate,
    time: String(raw.time || todayTime).trim().slice(0, 10),
    mood,
    title: String(raw.title || '').trim().slice(0, 300),
    text: String(raw.text || '').trim().slice(0, 50000) || '—',
  };
}

export function sanitizeMeta(raw?: Partial<LibraryMeta>): LibraryMeta {
  const gx = Array.isArray(raw?.gx)
    ? [...new Set(raw.gx.map((x) => String(x || '').trim().slice(0, 100)).filter(Boolean))].slice(
        0,
        100
      )
    : [];
  const tp: Record<string, string[]> = {};
  if (raw?.tp && typeof raw.tp === 'object') {
    const entries = Object.entries(raw.tp).slice(0, 100);
    for (const [k, list] of entries) {
      const key = String(k || '').trim().slice(0, 100);
      if (!key || !Array.isArray(list)) continue;
      tp[key] = [
        ...new Set(list.map((x) => String(x || '').trim().slice(0, 100)).filter(Boolean)),
      ].slice(0, 100);
    }
  }
  return { gx, tp };
}
