export type BookStatus = '' | 'want' | 'reading' | 'read';

export interface Book {
  id: string;
  ownerId?: string;
  t: string;
  a: string;
  g: string;
  tp: string;
  y: string;
  status: BookStatus;
  rt: number;
  pt: number;
  pg: number;
  nt: string;
  img?: string;
  pdf?: string;
  ts: number;
}

export interface LibraryMeta {
  gx: string[];
  tp: Record<string, string[]>;
}

export type DiaryMood =
  | 'good'
  | 'happy'
  | 'normal'
  | 'bad'
  | 'sad'
  | 'rainy'
  | 'worst'
  | 'best';

export interface DiaryPage {
  id: string;
  ownerId?: string;
  date: string;
  time: string;
  mood: DiaryMood;
  title: string;
  text: string;
}

export type HighlightColor = 'green' | 'blue' | 'red' | 'yellow';

export interface NormRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface NormPoint {
  x: number;
  y: number;
}

export interface BookAnnotation {
  id: string;
  ownerId?: string;
  bookId: string;
  page: number;
  kind: 'highlight' | 'note' | 'ink';
  color: HighlightColor;
  quote?: string;
  explanation?: string;
  rects?: NormRect[];
  points?: NormPoint[];
  ts: number;
}

export interface MediaTrack {
  id: string;
  ownerId?: string;
  title: string;
  artist: string;
  album: string;
  folder: string;
  source: 'local' | 'url';
  url: string;
  duration: number;
  size?: number;
  ts: number;
}

export interface MediaPhoto {
  id: string;
  ownerId?: string;
  title: string;
  album: string;
  source: 'local' | 'url';
  url: string;
  favorite: boolean;
  size?: number;
  ts: number;
}

export const HIGHLIGHT_COLORS: Record<
  HighlightColor,
  { label: string; bg: string; border: string; ink: string; swatch: string }
> = {
  green: {
    label: 'Green',
    bg: 'rgba(34, 197, 94, 0.34)',
    border: '#16a34a',
    ink: '#15803d',
    swatch: '#22c55e',
  },
  blue: {
    label: 'Blue',
    bg: 'rgba(59, 130, 246, 0.34)',
    border: '#2563eb',
    ink: '#1d4ed8',
    swatch: '#3b82f6',
  },
  red: {
    label: 'Red',
    bg: 'rgba(239, 68, 68, 0.34)',
    border: '#dc2626',
    ink: '#b91c1c',
    swatch: '#ef4444',
  },
  yellow: {
    label: 'Yellow',
    bg: 'rgba(234, 179, 8, 0.40)',
    border: '#ca8a04',
    ink: '#a16207',
    swatch: '#eab308',
  },
};

export const DEFAULT_GENRES: string[] = [
  'Biography',
  'Science',
  'Romance',
  'Fantasy',
  'Mystery & Thriller',
  'History',
  'Philosophy',
  'Horror',
  'CSE',
  'Fiction',
  'Non-Fiction',
  'Self-Help',
];

export const DEFAULT_META: LibraryMeta = {
  gx: [],
  tp: {
    History: ['Islamic', 'Ottoman', 'World War I', 'World War II'],
  },
};

export const MOODS: { id: DiaryMood; emoji: string; label: string }[] = [
  { id: 'good', emoji: '😊', label: 'Good day' },
  { id: 'happy', emoji: '🥳', label: 'Happy day' },
  { id: 'normal', emoji: '🙂', label: 'Normal day' },
  { id: 'bad', emoji: '😕', label: 'Bad day' },
  { id: 'sad', emoji: '😢', label: 'Sad day' },
  { id: 'rainy', emoji: '🌧️', label: 'Rainy day' },
  { id: 'worst', emoji: '💔', label: 'Worst day of my life' },
  { id: 'best', emoji: '🌟', label: 'Best day of my life' },
];

export const STATUS_LABELS: Record<Exclude<BookStatus, ''>, { icon: string; label: string }> = {
  want: { icon: '🔖', label: 'Want to read' },
  reading: { icon: '📖', label: 'Reading' },
  read: { icon: '✅', label: 'Finished' },
};
