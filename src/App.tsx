import React, { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  Book,
  BookStatus,
  DEFAULT_META,
  DiaryPage,
  LibraryMeta,
} from './types';
import {
  bookCompletenessScore,
  dedupeKey,
  nid,
  sanitizeBook,
  sanitizeDiaryPage,
  sanitizeMeta,
} from './lib/archiveUtils';
import { idbDelete, idbLoadImages } from './lib/idb';
import {
  deleteBookFromCloud,
  deleteDiaryPageFromCloud,
  saveBookToCloud,
  saveDiaryPageToCloud,
  saveMetaToCloud,
  subscribeUserArchive,
  updateBookStatusInCloud,
} from './lib/cloudSync';
import { LibraryView, SortOrder } from './components/LibraryView';
import { DiaryView } from './components/DiaryView';
import { BookModal } from './components/BookModal';
import { TextActionModal, TextModalMode } from './components/TextActionModal';
import { PromptModal } from './components/PromptModal';
import { Cloud, CloudOff, Moon, Sun } from 'lucide-react';

const LOCAL_STORAGE_KEY = 'lib2';
const THEME_KEY = 'archive_theme';

interface LocalSnapshot {
  B?: Record<string, Partial<Book>>;
  M?: Partial<LibraryMeta>;
  D?: Partial<DiaryPage>[];
}

function readLocalArchive(): {
  books: Record<string, Book>;
  meta: LibraryMeta;
  diary: DiaryPage[];
} {
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}') as LocalSnapshot;
    const books: Record<string, Book> = {};
    if (raw.B && typeof raw.B === 'object') {
      for (const [k, v] of Object.entries(raw.B)) {
        if (v && v.t) {
          const clean = sanitizeBook(v, k);
          books[clean.id] = clean;
        }
      }
    }
    const meta = raw.M
      ? sanitizeMeta({
          gx: raw.M.gx || [],
          tp: raw.M.tp || DEFAULT_META.tp,
        })
      : DEFAULT_META;
    const diary = Array.isArray(raw.D)
      ? raw.D.filter((x) => x && x.text).map((x) => sanitizeDiaryPage(x))
      : [];
    return { books, meta, diary };
  } catch {
    return { books: {}, meta: DEFAULT_META, diary: [] };
  }
}

function writeLocalArchive(
  books: Record<string, Book>,
  meta: LibraryMeta,
  diary: DiaryPage[],
  omitDiaryForCloud: boolean
) {
  try {
    const strippedBooks: Record<string, Omit<Book, 'img'>> = {};
    for (const [k, v] of Object.entries(books)) {
      const copy: Book = { ...v };
      delete copy.img;
      strippedBooks[k] = copy;
    }
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({
        B: strippedBooks,
        M: meta,
        D: omitDiaryForCloud ? [] : diary,
      })
    );
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export default function App() {
  const initialLocal = useRef(readLocalArchive());
  const [books, setBooks] = useState<Record<string, Book>>(initialLocal.current.books);
  const [meta, setMeta] = useState<LibraryMeta>(initialLocal.current.meta);
  const [diary, setDiary] = useState<DiaryPage[]>(initialLocal.current.diary);

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {
      // ignore
    }
    return 'dark';
  });

  const [view, setView] = useState<'lib' | 'diary'>('lib');
  const [genre, setGenre] = useState('All');
  const [topic, setTopic] = useState('All');
  const [tab, setTab] = useState<'all' | Exclude<BookStatus, ''>>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('new');
  const [limit, setLimit] = useState(60);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [syncingCount, setSyncingCount] = useState(0);

  // Modals
  const [bookModalOpen, setBookModalOpen] = useState(false);
  const [editingBookId, setEditingBookId] = useState<string | null>(null);

  const [textModalOpen, setTextModalOpen] = useState(false);
  const [textModalMode, setTextModalMode] = useState<TextModalMode>('backup');
  const [textModalScope, setTextModalScope] = useState<'full' | 'diary'>('full');

  const [promptConfig, setPromptConfig] = useState<{
    open: boolean;
    title: string;
    description?: string;
    placeholder?: string;
    confirmLabel?: string;
    requireInput?: boolean;
    danger?: boolean;
    onConfirm: (val: string) => void;
  }>({
    open: false,
    title: '',
    onConfirm: () => {},
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const migratedForUid = useRef<string | null>(null);
  const booksRef = useRef(books);
  const metaRef = useRef(meta);
  const diaryRef = useRef(diary);
  booksRef.current = books;
  metaRef.current = meta;
  diaryRef.current = diary;

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 5500);
  }, []);

  // Apply theme class to <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  // Load cached cover images from IndexedDB
  useEffect(() => {
    idbLoadImages()
      .then((imgMap) => {
        if (Object.keys(imgMap).length === 0) return;
        setBooks((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [id, dataUrl] of Object.entries(imgMap)) {
            if (next[id] && !next[id].img) {
              next[id] = { ...next[id], img: dataUrl };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      })
      .catch(() => {});
  }, []);

  // Persist local state whenever data changes
  useEffect(() => {
    writeLocalArchive(books, meta, diary, Boolean(user));
  }, [books, meta, diary, user]);

  // Track Firebase auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        migratedForUid.current = null;
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore user collections when signed in
  useEffect(() => {
    if (!authReady || !user) return;
    const uid = user.uid;

    let initialBooksChecked = false;
    let initialMetaChecked = false;
    let initialDiaryChecked = false;

    const unsub = subscribeUserArchive(uid, {
      onBooks: (cloudBooks, cloudIds) => {
        setBooks((prev) => {
          const merged: Record<string, Book> = { ...cloudBooks };
          // Preserve local-only cover image or local PDF flag if present in browser
          for (const [id, localB] of Object.entries(prev)) {
            if (merged[id]) {
              if (!merged[id].img && localB.img) merged[id].img = localB.img;
              if (!merged[id].pdf && localB.pdf === 'local') merged[id].pdf = 'local';
            }
          }
          return merged;
        });

        // Push any local-only books created before sign-in
        if (!initialBooksChecked) {
          initialBooksChecked = true;
          const localOnly = Object.values(booksRef.current).filter(
            (b) => !cloudIds.has(b.id)
          );
          if (localOnly.length > 0 && migratedForUid.current !== uid) {
            setSyncingCount((c) => c + localOnly.length);
            Promise.all(
              localOnly.map((b) =>
                saveBookToCloud(uid, b)
                  .catch(() => {})
                  .finally(() => setSyncingCount((c) => Math.max(0, c - 1)))
              )
            ).catch(() => {});
          }
        }
      },
      onMeta: (cloudMeta, exists) => {
        if (exists && cloudMeta) {
          setMeta(cloudMeta);
        } else if (!initialMetaChecked) {
          initialMetaChecked = true;
          saveMetaToCloud(uid, metaRef.current).catch(() => {});
        }
      },
      onDiary: (cloudPages, cloudIds) => {
        setDiary(cloudPages);
        if (!initialDiaryChecked) {
          initialDiaryChecked = true;
          const localOnlyPages = diaryRef.current.filter((p) => !cloudIds.has(p.id));
          if (localOnlyPages.length > 0 && migratedForUid.current !== uid) {
            setSyncingCount((c) => c + localOnlyPages.length);
            Promise.all(
              localOnlyPages.map((p) =>
                saveDiaryPageToCloud(uid, p)
                  .catch(() => {})
                  .finally(() => setSyncingCount((c) => Math.max(0, c - 1)))
              )
            ).catch(() => {});
          }
          migratedForUid.current = uid;
        }
      },
      onError: (err) => {
        console.error(err);
        showToast('Cloud sync encountered a permissions or connection issue.');
      },
    });

    return () => unsub();
  }, [authReady, user, showToast]);

  const handleGoogleAuth = async () => {
    if (user) {
      await signOut(auth);
      showToast('Signed out. Data remains saved locally on this device.');
      return;
    }
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in! Your library and diary now sync across devices.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign-in cancelled';
      if (!message.includes('popup-closed-by-user')) {
        showToast('Could not complete Google sign-in. Please try again.');
      }
    }
  };

  const trackCloudOp = (promise: Promise<void>) => {
    setSyncingCount((c) => c + 1);
    promise
      .catch((err) => {
        console.error(err);
        showToast('Failed to sync change to cloud.');
      })
      .finally(() => setSyncingCount((c) => Math.max(0, c - 1)));
  };

  // Book CRUD
  const handleSaveBook = (book: Book) => {
    setBooks((prev) => ({ ...prev, [book.id]: book }));
    if (book.g && book.tp) {
      const currentTopics = meta.tp[book.g] || [];
      if (!currentTopics.includes(book.tp)) {
        const nextMeta: LibraryMeta = {
          ...meta,
          tp: { ...meta.tp, [book.g]: [...currentTopics, book.tp] },
        };
        setMeta(nextMeta);
        if (user) trackCloudOp(saveMetaToCloud(user.uid, nextMeta));
      }
    }
    if (user) {
      trackCloudOp(saveBookToCloud(user.uid, book));
    }
    showToast('Book saved');
  };

  const handleDeleteBook = (bookId: string) => {
    setBooks((prev) => {
      const next = { ...prev };
      delete next[bookId];
      return next;
    });
    idbDelete(`img:${bookId}`).catch(() => {});
    if (user) {
      trackCloudOp(deleteBookFromCloud(user.uid, bookId));
    }
    showToast('Book deleted');
  };

  const handleToggleStatus = (book: Book, clickedStatus: Exclude<BookStatus, ''>) => {
    const nextStatus: BookStatus = book.status === clickedStatus ? '' : clickedStatus;
    const updated: Book = { ...book, status: nextStatus };
    setBooks((prev) => ({ ...prev, [book.id]: updated }));
    if (user) {
      trackCloudOp(updateBookStatusInCloud(user.uid, updated));
    }
  };

  const handleAddGenre = () => {
    setPromptConfig({
      open: true,
      title: 'Add New Genre',
      placeholder: 'e.g. Islamic History, Poetry, Physics',
      confirmLabel: 'Add Genre',
      requireInput: true,
      onConfirm: (name) => {
        if (!meta.gx.includes(name)) {
          const nextMeta: LibraryMeta = { ...meta, gx: [...meta.gx, name] };
          setMeta(nextMeta);
          if (user) trackCloudOp(saveMetaToCloud(user.uid, nextMeta));
        }
        setGenre(name);
        setTopic('All');
        setLimit(60);
      },
    });
  };

  const handleAddTopic = () => {
    setPromptConfig({
      open: true,
      title: `New Topic in ${genre}`,
      placeholder: 'e.g. Ottoman, Algorithms, Metaphysics',
      confirmLabel: 'Add Topic',
      requireInput: true,
      onConfirm: (name) => {
        const current = meta.tp[genre] || [];
        if (!current.includes(name)) {
          const nextMeta: LibraryMeta = {
            ...meta,
            tp: { ...meta.tp, [genre]: [...current, name] },
          };
          setMeta(nextMeta);
          if (user) trackCloudOp(saveMetaToCloud(user.uid, nextMeta));
        }
        setTopic(name);
        setLimit(60);
      },
    });
  };

  const handleRemoveDuplicates = () => {
    const grouped: Record<string, Book[]> = {};
    for (const b of Object.values(books)) {
      const k = dedupeKey(b);
      (grouped[k] = grouped[k] || []).push(b);
    }
    const toRemove: Book[] = [];
    for (const group of Object.values(grouped)) {
      if (group.length < 2) continue;
      group.sort(
        (a, b) =>
          bookCompletenessScore(b) - bookCompletenessScore(a) ||
          (a.ts || 0) - (b.ts || 0)
      );
      toRemove.push(...group.slice(1));
    }

    if (toRemove.length === 0) {
      showToast('No duplicates found 👍');
      return;
    }

    setPromptConfig({
      open: true,
      title: 'Remove Duplicate Books',
      description: `Found ${toRemove.length} duplicate book${toRemove.length > 1 ? 's' : ''}. Delete them? The most complete copy of each book will be kept.`,
      confirmLabel: `Delete ${toRemove.length} Duplicate${toRemove.length > 1 ? 's' : ''}`,
      requireInput: false,
      danger: true,
      onConfirm: () => {
        setBooks((prev) => {
          const next = { ...prev };
          for (const b of toRemove) {
            delete next[b.id];
          }
          return next;
        });
        for (const b of toRemove) {
          idbDelete(`img:${b.id}`).catch(() => {});
          if (user) trackCloudOp(deleteBookFromCloud(user.uid, b.id));
        }
        showToast(`Removed ${toRemove.length} duplicate books`);
      },
    });
  };

  const handleRestore = (payload: {
    B?: Record<string, Partial<Book>>;
    M?: Partial<LibraryMeta>;
    D?: Partial<DiaryPage>[];
  }) => {
    const restoredBooks: Book[] = [];
    if (payload.B && typeof payload.B === 'object') {
      const nextBooks = { ...books };
      for (const [key, rawBook] of Object.entries(payload.B)) {
        if (!rawBook || !rawBook.t) continue;
        const clean = sanitizeBook(rawBook, key);
        nextBooks[clean.id] = clean;
        restoredBooks.push(clean);
      }
      setBooks(nextBooks);
    }

    let nextMeta = { ...meta, tp: { ...meta.tp } };
    let metaChanged = false;
    if (payload.M) {
      if (Array.isArray(payload.M.gx)) {
        nextMeta.gx = Array.from(new Set([...nextMeta.gx, ...payload.M.gx]));
        metaChanged = true;
      }
      if (payload.M.tp && typeof payload.M.tp === 'object') {
        for (const [g, list] of Object.entries(payload.M.tp)) {
          if (!Array.isArray(list)) continue;
          nextMeta.tp[g] = Array.from(new Set([...(nextMeta.tp[g] || []), ...list]));
        }
        metaChanged = true;
      }
      nextMeta = sanitizeMeta(nextMeta);
      if (metaChanged) setMeta(nextMeta);
    }

    const restoredDiary: DiaryPage[] = [];
    if (Array.isArray(payload.D)) {
      const existingIds = new Set(diary.map((x) => x.id));
      const nextDiary = [...diary];
      for (const rawPage of payload.D) {
        if (!rawPage || !rawPage.text) continue;
        const clean = sanitizeDiaryPage(rawPage);
        if (!existingIds.has(clean.id)) {
          existingIds.add(clean.id);
          nextDiary.push(clean);
          restoredDiary.push(clean);
        }
      }
      setDiary(nextDiary);
    }

    if (user) {
      if (metaChanged) trackCloudOp(saveMetaToCloud(user.uid, nextMeta));
      for (const b of restoredBooks) trackCloudOp(saveBookToCloud(user.uid, b));
      for (const d of restoredDiary) trackCloudOp(saveDiaryPageToCloud(user.uid, d));
    }

    showToast(
      `Restored ${restoredBooks.length} books & ${restoredDiary.length} diary pages`
    );
  };

  const handleBulkAdd = (linesText: string) => {
    const seen = new Set(Object.values(books).map(dedupeKey));
    const addedBooks: Book[] = [];
    let skipped = 0;

    const nextBooks = { ...books };
    let nextMeta = { ...meta, tp: { ...meta.tp } };
    let metaChanged = false;

    for (const rawLine of linesText.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(' - ').map((x) => x.trim());
      const title = parts[0];
      if (!title) continue;
      const author = parts[1] || '';
      const k = dedupeKey({ t: title, a: author });
      if (seen.has(k)) {
        skipped++;
        continue;
      }
      seen.add(k);

      const b = sanitizeBook({
        id: nid(),
        ts: Date.now(),
        t: title,
        a: author,
        g: parts[2] || '',
        tp: parts[3] || '',
        y: '',
        status: 'want',
        rt: 0,
        pg: 0,
        pt: 0,
        nt: parts.slice(4).join(' - '),
      });

      nextBooks[b.id] = b;
      addedBooks.push(b);

      if (b.g && b.tp) {
        const list = nextMeta.tp[b.g] || [];
        if (!list.includes(b.tp)) {
          nextMeta.tp[b.g] = [...list, b.tp];
          metaChanged = true;
        }
      }
    }

    setBooks(nextBooks);
    if (metaChanged) {
      nextMeta = sanitizeMeta(nextMeta);
      setMeta(nextMeta);
    }

    if (user) {
      if (metaChanged) trackCloudOp(saveMetaToCloud(user.uid, nextMeta));
      for (const b of addedBooks) trackCloudOp(saveBookToCloud(user.uid, b));
    }

    showToast(
      `Added ${addedBooks.length} new books · skipped ${skipped} already in library`
    );
  };

  // Diary CRUD
  const handleSaveDiaryPage = (page: DiaryPage) => {
    const clean = sanitizeDiaryPage(page);
    setDiary((prev) => [...prev.filter((x) => x.id !== clean.id), clean]);
    if (user) {
      trackCloudOp(saveDiaryPageToCloud(user.uid, clean));
    }
    showToast('Diary page saved');
  };

  const handleDeleteDiaryPage = (id: string) => {
    setDiary((prev) => prev.filter((x) => x.id !== id));
    if (user) {
      trackCloudOp(deleteDiaryPageFromCloud(user.uid, id));
    }
    showToast('Diary page deleted');
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-300 text-stone-900 dark:text-slate-100 ${
        theme === 'dark' ? 'archive-canvas-dark' : 'archive-canvas-light'
      }`}
    >
      <div className="min-h-screen archive-grid-overlay flex flex-col">
        {/* Strict 3-Zone Single-Row Top Bar */}
        <header className="sticky top-0 z-30 border-b border-stone-300/70 dark:border-slate-800/80 bg-[#F4F0E8]/85 dark:bg-[#0D1017]/85 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                setView('lib');
              }}
              className="font-display text-xl sm:text-2xl font-semibold tracking-tight text-stone-900 dark:text-slate-100 whitespace-nowrap shrink-0"
            >
              Al Thahazeeb Noor Rayan
            </a>

            <nav className="flex items-center gap-6 text-sm font-medium">
              <button
                type="button"
                onClick={() => setView('lib')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  view === 'lib'
                    ? 'border-[#26428B] dark:border-[#D6A456] text-stone-900 dark:text-white'
                    : 'border-transparent text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                Library
              </button>
              <button
                type="button"
                onClick={() => setView('diary')}
                className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                  view === 'diary'
                    ? 'border-[#26428B] dark:border-[#D6A456] text-stone-900 dark:text-white'
                    : 'border-transparent text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                Diary
              </button>
            </nav>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void handleGoogleAuth()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 hover:opacity-95 transition-opacity whitespace-nowrap shrink-0"
              >
                {user ? 'Sign out' : 'Sync with Google'}
              </button>
            </div>
          </div>
        </header>

        {/* Editorial Hero / Workspace Strip */}
        <section className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-8 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-stone-300/60 dark:border-slate-800/80 pb-5">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-stone-500 dark:text-slate-400">
                Personal Archive
              </p>
              <h1 className="font-display italic font-normal text-4xl sm:text-5xl text-stone-900 dark:text-slate-50 mt-1 text-balance">
                {view === 'lib' ? 'Book List & Reading Shelf' : 'Private Daily Diary'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-1.5 text-xs text-stone-600 dark:text-slate-400">
                {user ? (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span className="truncate max-w-[220px]">
                      {syncingCount > 0
                        ? `Syncing (${syncingCount})…`
                        : `Synced · ${user.email}`}
                    </span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5" />
                    <span>Saved in browser · Sign in to sync across devices</span>
                  </>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                aria-label="Toggle light or dark background"
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/70 dark:bg-[#171C27] px-3 py-1.5 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
              >
                {theme === 'dark' ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    Light Paper
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5 text-[#26428B]" />
                    Midnight Study
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Main Workspace */}
        <main className="flex-1 w-full px-4 sm:px-6 pt-2">
          {view === 'lib' ? (
            <LibraryView
              books={books}
              meta={meta}
              genre={genre}
              topic={topic}
              tab={tab}
              query={query}
              sort={sort}
              limit={limit}
              onGenreChange={(g) => {
                setGenre(g);
                setTopic('All');
                setLimit(60);
              }}
              onTopicChange={(tp) => {
                setTopic(tp);
                setLimit(60);
              }}
              onTabChange={(t) => {
                setTab(t);
                setLimit(60);
              }}
              onQueryChange={(q) => {
                setQuery(q);
                setLimit(60);
              }}
              onSortChange={(s) => {
                setSort(s);
                setLimit(60);
              }}
              onLoadMore={() => setLimit((l) => l + 60)}
              onAddBook={() => {
                setEditingBookId(null);
                setBookModalOpen(true);
              }}
              onEditBook={(id) => {
                setEditingBookId(id);
                setBookModalOpen(true);
              }}
              onToggleStatus={handleToggleStatus}
              onAddGenre={handleAddGenre}
              onAddTopic={handleAddTopic}
              onOpenBulk={() => {
                setTextModalMode('bulk');
                setTextModalOpen(true);
              }}
              onOpenBackup={() => {
                setTextModalMode('backup');
                setTextModalScope('full');
                setTextModalOpen(true);
              }}
              onOpenRestore={() => {
                setTextModalMode('restore');
                setTextModalOpen(true);
              }}
              onRemoveDuplicates={handleRemoveDuplicates}
              onToast={showToast}
            />
          ) : (
            <DiaryView
              diary={diary}
              onSavePage={handleSaveDiaryPage}
              onDeletePage={handleDeleteDiaryPage}
              onOpenDiaryBackup={() => {
                setTextModalMode('backup');
                setTextModalScope('diary');
                setTextModalOpen(true);
              }}
              onOpenRestore={() => {
                setTextModalMode('restore');
                setTextModalOpen(true);
              }}
              isSignedIn={Boolean(user)}
            />
          )}
        </main>

        {/* Modals */}
        <BookModal
          isOpen={bookModalOpen}
          book={editingBookId ? books[editingBookId] || null : null}
          allBooks={Object.values(books)}
          meta={meta}
          defaultGenre={genre}
          defaultTopic={topic}
          onClose={() => setBookModalOpen(false)}
          onSave={handleSaveBook}
          onDelete={handleDeleteBook}
          onToast={showToast}
        />

        <TextActionModal
          isOpen={textModalOpen}
          mode={textModalMode}
          defaultScope={textModalScope}
          books={books}
          meta={meta}
          diary={diary}
          onClose={() => setTextModalOpen(false)}
          onRestore={handleRestore}
          onBulkAdd={handleBulkAdd}
          onToast={showToast}
        />

        <PromptModal
          isOpen={promptConfig.open}
          title={promptConfig.title}
          description={promptConfig.description}
          placeholder={promptConfig.placeholder}
          confirmLabel={promptConfig.confirmLabel}
          requireInput={promptConfig.requireInput}
          danger={promptConfig.danger}
          onClose={() => setPromptConfig((p) => ({ ...p, open: false }))}
          onConfirm={promptConfig.onConfirm}
        />

        {/* Toast Notification */}
        {toastMsg && (
          <div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-50 rounded-lg bg-stone-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 text-xs font-medium shadow-xl max-w-[90vw] text-center">
            {toastMsg}
          </div>
        )}
      </div>
    </div>
  );
}
