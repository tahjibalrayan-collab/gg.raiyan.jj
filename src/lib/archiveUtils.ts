import {
  Book,
  BookAnnotation,
  BookStatus,
  DiaryMood,
  DiaryPage,
  HighlightColor,
  LibraryMeta,
  MediaPhoto,
  MediaTrack,
  NormPoint,
  NormRect,
} from '../types';

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
const VALID_COLORS = new Set<HighlightColor>(['green', 'blue', 'red', 'yellow']);

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

export function sanitizeAnnotation(
  raw: Partial<BookAnnotation>,
  fallbackId?: string
): BookAnnotation {
  const id = sanitizeId(raw.id || fallbackId);
  const bookId = sanitizeId(raw.bookId);
  const color: HighlightColor = VALID_COLORS.has(raw.color as HighlightColor)
    ? (raw.color as HighlightColor)
    : 'yellow';
  const kind: BookAnnotation['kind'] =
    raw.kind === 'note' || raw.kind === 'ink' ? raw.kind : 'highlight';
  const rects: NormRect[] | undefined = Array.isArray(raw.rects)
    ? raw.rects.slice(0, 120).map((r) => ({
        x: Number(r.x) || 0,
        y: Number(r.y) || 0,
        w: Number(r.w) || 0,
        h: Number(r.h) || 0,
      }))
    : undefined;
  const points: NormPoint[] | undefined = Array.isArray(raw.points)
    ? raw.points.slice(0, 600).map((p) => ({
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
      }))
    : undefined;

  return {
    id,
    bookId,
    page: Math.min(50000, Math.max(1, Math.round(Number(raw.page) || 1))),
    kind,
    color,
    quote: raw.quote ? String(raw.quote).slice(0, 5000) : '',
    explanation: raw.explanation ? String(raw.explanation).slice(0, 10000) : '',
    rects,
    points,
    ts: Number(raw.ts) > 0 ? Number(raw.ts) : Date.now(),
  };
}

export function sanitizeMediaTrack(raw: Partial<MediaTrack>, fallbackId?: string): MediaTrack {
  const id = sanitizeId(raw.id || fallbackId);
  return {
    id,
    title: String(raw.title || 'Untitled Track').trim().slice(0, 300) || 'Untitled Track',
    artist: String(raw.artist || '').trim().slice(0, 200),
    album: String(raw.album || '').trim().slice(0, 200),
    folder: String(raw.folder || 'General').trim().slice(0, 120) || 'General',
    source: raw.source === 'url' ? 'url' : 'local',
    url: String(raw.url || '').trim().slice(0, 2048),
    duration: Math.max(0, Number(raw.duration) || 0),
    size: Number(raw.size) || undefined,
    ts: Number(raw.ts) > 0 ? Number(raw.ts) : Date.now(),
  };
}

export function sanitizeMediaPhoto(raw: Partial<MediaPhoto>, fallbackId?: string): MediaPhoto {
  const id = sanitizeId(raw.id || fallbackId);
  return {
    id,
    title: String(raw.title || 'Untitled Photo').trim().slice(0, 300) || 'Untitled Photo',
    album: String(raw.album || 'All Photos').trim().slice(0, 120) || 'All Photos',
    source: raw.source === 'url' ? 'url' : 'local',
    url: String(raw.url || '').trim().slice(0, 2048),
    favorite: Boolean(raw.favorite),
    size: Number(raw.size) || undefined,
    ts: Number(raw.ts) > 0 ? Number(raw.ts) : Date.now(),
  };
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, i);
  return `${val >= 10 ? val.toFixed(0) : val.toFixed(1)} ${units[i]}`;
}

export function formatDuration(sec: number): string {
  if (!sec || !Number.isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function createPhotoThumbnail(file: Blob, maxSize = 320): Promise<Blob | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        resolve(undefined);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(url);
          resolve(blob || undefined);
        },
        'image/jpeg',
        0.76
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(undefined);
    };
    img.src = url;
  });
}

export function toInAppEmbedUrl(rawUrl: string): string {
  const driveMatch = rawUrl.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
  if (driveMatch && driveMatch[1]) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
  }
  return rawUrl;
}
