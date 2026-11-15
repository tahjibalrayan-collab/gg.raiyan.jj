import React, { useEffect, useMemo, useState } from 'react';
import { DiaryMood, DiaryPage, MOODS } from '../types';
import { getTodayDateTime, nid } from '../lib/archiveUtils';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Feather,
  Trash2,
  Upload,
} from 'lucide-react';

interface DiaryViewProps {
  diary: DiaryPage[];
  onSavePage: (page: DiaryPage) => void;
  onDeletePage: (id: string) => void;
  onOpenDiaryBackup: () => void;
  onOpenRestore: () => void;
  isSignedIn: boolean;
}

export const DiaryView: React.FC<DiaryViewProps> = ({
  diary,
  onSavePage,
  onDeletePage,
  onOpenDiaryBackup,
  onOpenRestore,
  isSignedIn,
}) => {
  const [moodFilter, setMoodFilter] = useState<'All' | DiaryMood>('All');
  const [pageIdx, setPageIdx] = useState(0);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [mood, setMood] = useState<DiaryMood>('normal');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [flipClass, setFlipClass] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sortedAll = useMemo(
    () =>
      diary
        .slice()
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [diary]
  );

  const filtered = useMemo(
    () => sortedAll.filter((e) => moodFilter === 'All' || e.mood === moodFilter),
    [sortedAll, moodFilter]
  );

  const safeIdx = Math.min(pageIdx, Math.max(0, filtered.length - 1));
  const currentEntry = filtered[safeIdx];

  useEffect(() => {
    setConfirmDeleteId(null);
  }, [safeIdx, moodFilter]);

  const flipPage = (dir: -1 | 1) => {
    const next = safeIdx + dir;
    if (next < 0 || next >= filtered.length) return;
    setFlipClass(dir > 0 ? 'flip-out-left' : 'flip-out-right');
    setTimeout(() => {
      setPageIdx(next);
      setFlipClass(dir > 0 ? 'flip-in-right' : 'flip-in-left');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setFlipClass(''));
      });
    }, 200);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight') flipPage(1);
      if (e.key === 'ArrowLeft') flipPage(-1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeIdx, filtered.length]);

  const openNewComposer = () => {
    const [d, t] = getTodayDateTime();
    setEditingId(null);
    setDate(d);
    setTime(t);
    setMood('normal');
    setTitle('');
    setText('');
    setComposerOpen(true);
  };

  const openEditComposer = (entry: DiaryPage) => {
    setEditingId(entry.id);
    setDate(entry.date);
    setTime(entry.time || '');
    setMood(entry.mood);
    setTitle(entry.title || '');
    setText(entry.text);
    setComposerOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = editingId || nid();
    const entry: DiaryPage = {
      id,
      date: date || getTodayDateTime()[0],
      time: time || getTodayDateTime()[1],
      mood,
      title: title.trim(),
      text: trimmed,
    };
    onSavePage(entry);
    setMoodFilter('All');
    const nextSorted = [...diary.filter((x) => x.id !== id), entry].sort((a, b) =>
      `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)
    );
    const idx = nextSorted.findIndex((x) => x.id === id);
    setPageIdx(idx >= 0 ? idx : 0);
    setComposerOpen(false);
    setEditingId(null);
  };

  const currentMoodMeta = currentEntry
    ? MOODS.find((m) => m.id === currentEntry.mood)
    : null;
  const dayNumber = currentEntry ? sortedAll.findIndex((x) => x.id === currentEntry.id) + 1 : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-12">
      {/* Mood Filter Strip */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setMoodFilter('All');
            setPageIdx(0);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
            moodFilter === 'All'
              ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent shadow-sm'
              : 'bg-white/60 dark:bg-[#171C27]/80 text-stone-700 dark:text-slate-300 border-stone-300/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-[#1E2534]'
          }`}
        >
          📓 All pages
        </button>
        {MOODS.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMoodFilter(m.id);
              setPageIdx(0);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
              moodFilter === m.id
                ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent shadow-sm'
                : 'bg-white/60 dark:bg-[#171C27]/80 text-stone-700 dark:text-slate-300 border-stone-300/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-[#1E2534]'
            }`}
          >
            {m.emoji} {m.label}
          </button>
        ))}
      </div>

      {/* Diary Action Bar (Including Backup & Restore right inside Diary!) */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={openNewComposer}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-4 py-2 text-xs font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-sm"
        >
          <Feather className="w-3.5 h-3.5" />
          Write a new page
        </button>
        <button
          type="button"
          onClick={onOpenDiaryBackup}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Backup Diary
        </button>
        <button
          type="button"
          onClick={onOpenRestore}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
        >
          <Upload className="w-3.5 h-3.5" />
          Restore Diary
        </button>
      </div>

      {/* Composer Panel */}
      {composerOpen && (
        <form
          onSubmit={handleSave}
          className="rounded-xl border border-stone-300 dark:border-slate-700/80 bg-[#FAF7F0] dark:bg-[#151A25] p-5 shadow-lg space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm font-mono-num"
            />
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm font-mono-num"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMood(m.id)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  mood === m.id
                    ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent'
                    : 'bg-white dark:bg-[#0E121B] text-stone-700 dark:text-slate-300 border-stone-300 dark:border-slate-700'
                }`}
              >
                {m.emoji} {m.label}
              </button>
            ))}
          </div>

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm"
          />

          <textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write about your day…"
            required
            className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2.5 text-sm leading-relaxed"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setComposerOpen(false);
                setEditingId(null);
              }}
              className="rounded-lg border border-stone-300 dark:border-slate-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-5 py-2 text-xs font-semibold hover:opacity-95"
            >
              Save page
            </button>
          </div>
        </form>
      )}

      {/* Bound Leather / Walnut Diary Book */}
      <div className="flex items-center gap-2 sm:gap-3 rounded-2xl bg-gradient-to-br from-[#683E21] via-[#543119] to-[#3E2210] p-3 sm:p-4 shadow-2xl border border-[#845534]/50">
        <button
          type="button"
          onClick={() => flipPage(-1)}
          disabled={safeIdx <= 0}
          aria-label="Previous diary page"
          className="flex-none w-10 h-16 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex-1 min-w-0">
          {!currentEntry ? (
            <div className={`diary-paper min-h-[360px] rounded-r-lg rounded-l-sm p-6 sm:p-8 ${flipClass}`}>
              <h3 className="font-display text-2xl font-semibold text-stone-900 mb-2">
                My Diary
              </h3>
              <p className="text-sm text-stone-700">
                {diary.length > 0
                  ? 'No pages for this mood yet.'
                  : 'This diary is empty. Click “Write a new page” to start Day 1, or click “Restore Diary” to import saved entries.'}
              </p>
            </div>
          ) : (
            <div
              className={`diary-paper min-h-[360px] rounded-r-lg rounded-l-sm px-6 py-5 sm:px-9 sm:py-6 flex flex-col justify-between ${flipClass}`}
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono-num text-[#746243] mb-2">
                  <span>
                    Day {dayNumber} · {currentEntry.date} {currentEntry.time || ''}
                  </span>
                  <span>
                    {currentMoodMeta ? `${currentMoodMeta.emoji} ${currentMoodMeta.label}` : ''}
                  </span>
                </div>

                {currentEntry.title && (
                  <h3 className="font-display text-2xl font-semibold text-stone-900 mb-1">
                    {currentEntry.title}
                  </h3>
                )}

                <p className="text-[15px] text-[#2F2519] whitespace-pre-wrap leading-[29px]">
                  {currentEntry.text}
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-5 mt-4 text-xs text-[#746243]">
                <span className="font-mono-num">
                  Page {safeIdx + 1} / {filtered.length}
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEditComposer(currentEntry)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#D4C29B] bg-[#F7F1E1] px-2.5 py-1 text-xs font-medium text-[#4A3B24] hover:bg-[#EFE5CE] transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                    Edit
                  </button>

                  {confirmDeleteId === currentEntry.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        onDeletePage(currentEntry.id);
                        setConfirmDeleteId(null);
                      }}
                      className="rounded-md bg-red-600 text-white px-2.5 py-1 text-xs font-semibold hover:bg-red-700"
                    >
                      Confirm delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(currentEntry.id)}
                      className="inline-flex items-center gap-1 rounded-md border border-[#D4C29B] bg-[#F7F1E1] px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => flipPage(1)}
          disabled={safeIdx >= filtered.length - 1}
          aria-label="Next diary page"
          className="flex-none w-10 h-16 rounded-xl bg-white/15 hover:bg-white/25 disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <p className="text-center text-xs text-stone-600 dark:text-slate-400">
        {isSignedIn
          ? 'Your diary is private to your signed-in Google account and synced across your devices.'
          : 'Your diary is saved locally in this browser. Sign in with Google to sync automatically across Computer & Mobile.'}
      </p>
    </div>
  );
};
