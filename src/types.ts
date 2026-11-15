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
