import React, { useMemo, useState } from 'react';
import {
  Book,
  BookStatus,
  DEFAULT_GENRES,
  LibraryMeta,
  STATUS_LABELS,
} from '../types';
import { computeHue } from '../lib/archiveUtils';
import {
  BookOpen,
  CopyCheck,
  Download,
  Edit3,
  FileText,
  FolderPlus,
  Plus,
  Search,
  Upload,
} from 'lucide-react';

export type SortOrder = 'new' | 't' | 'a' | 'r';

interface LibraryViewProps {
  books: Record<string, Book>;
  meta: LibraryMeta;
  genre: string;
  topic: string;
  tab: 'all' | Exclude<BookStatus, ''>;
  query: string;
  sort: SortOrder;
  limit: number;
  onGenreChange: (g: string) => void;
  onTopicChange: (tp: string) => void;
  onTabChange: (t: 'all' | Exclude<BookStatus, ''>) => void;
  onQueryChange: (q: string) => void;
  onSortChange: (s: SortOrder) => void;
  onLoadMore: () => void;
  onAddBook: () => void;
  onEditBook: (id: string) => void;
  onOpenReader: (book: Book) => void;
  annotationCounts: Record<string, number>;
  onToggleStatus: (book: Book, status: Exclude<BookStatus, ''>) => void;
  onAddGenre: () => void;
  onAddTopic: () => void;
  onOpenBulk: () => void;
  onOpenBackup: () => void;
  onOpenRestore: () => void;
  onRemoveDuplicates: () => void;
}

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  meta,
  genre,
  topic,
  tab,
  query,
  sort,
  limit,
  onGenreChange,
  onTopicChange,
  onTabChange,
  onQueryChange,
  onSortChange,
  onLoadMore,
  onAddBook,
  onEditBook,
  onOpenReader,
  annotationCounts,
  onToggleStatus,
  onAddGenre,
  onAddTopic,
  onOpenBulk,
  onOpenBackup,
  onOpenRestore,
  onRemoveDuplicates,
}) => {
  const [hoveredBook, setHoveredBook] = useState<{
    book: Book;
    x: number;
    y: number;
  } | null>(null);

  const allBooks = useMemo(() => Object.values(books), [books]);

  const counts = useMemo(() => {
    let reading = 0;
    let want = 0;
    let read = 0;
    for (const b of allBooks) {
      if (b.status === 'reading') reading++;
      else if (b.status === 'want') want++;
      else if (b.status === 'read') read++;
    }
    return { total: allBooks.length, reading, want, read };
  }, [allBooks]);

  const genreList = useMemo(() => {
    return [
      'All',
      ...new Set([
        ...DEFAULT_GENRES,
        ...meta.gx,
        ...allBooks.map((b) => b.g).filter(Boolean),
      ]),
    ];
  }, [meta.gx, allBooks]);

  const topicList = useMemo(() => {
    if (genre === 'All') return [];
    return [
      ...new Set([
        ...(meta.tp[genre] || []),
        ...allBooks.filter((b) => b.g === genre).map((b) => b.tp).filter(Boolean),
      ]),
    ];
  }, [genre, meta.tp, allBooks]);

  const filteredBooks = useMemo(() => {
    const ql = query.trim().toLowerCase();
    const list = allBooks.filter(
      (b) =>
        (tab === 'all' || b.status === tab) &&
        (genre === 'All' || b.g === genre) &&
        (topic === 'All' || b.tp === topic) &&
        (!ql ||
          [b.t, b.a, b.g, b.tp].join(' ').toLowerCase().includes(ql))
    );
    list.sort((a, b) => {
      if (sort === 't') return a.t.localeCompare(b.t);
      if (sort === 'a') return (a.a || '~').localeCompare(b.a || '~');
      if (sort === 'r') return (b.rt || 0) - (a.rt || 0);
      return (b.ts || 0) - (a.ts || 0);
    });
    return list;
  }, [allBooks, tab, genre, topic, query, sort]);

  const visibleBooks = filteredBooks.slice(0, limit);

  const handleBookPrimaryClick = (book: Book) => {
    if (book.pdf) {
      onOpenReader(book);
    } else {
      onEditBook(book.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Volume Stats Strip */}
      <div className="max-w-3xl mx-auto text-center space-y-3 pt-2">
        <p className="text-xs font-mono-num tracking-wide text-stone-600 dark:text-slate-400">
          {counts.total} volumes · {counts.reading} reading · {counts.want} to read ·{' '}
          {counts.read} finished
          {(filteredBooks.length < allBooks.length || filteredBooks.length > limit) &&
            ` · showing ${Math.min(limit, filteredBooks.length)} of ${filteredBooks.length}`}
        </p>

        <div className="relative max-w-xl mx-auto">
          <Search className="w-4 h-4 text-stone-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search by title, author, genre, or topic…"
            aria-label="Search library"
            className="w-full rounded-xl border border-stone-300/90 dark:border-slate-700/80 bg-white/80 dark:bg-[#141923]/90 pl-10 pr-4 py-2.5 text-sm text-stone-900 dark:text-slate-100 placeholder:text-stone-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#26428B] dark:focus:ring-[#D6A456] shadow-sm transition-shadow"
          />
        </div>
      </div>

      {/* Genres, Topics & Reading Status Filters */}
      <div className="max-w-5xl mx-auto space-y-2.5">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {genreList.map((g) => {
            const count = g === 'All' ? 0 : allBooks.filter((b) => b.g === g).length;
            const active = genre === g;
            return (
              <button
                key={g}
                type="button"
                onClick={() => onGenreChange(g)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent shadow-sm'
                    : 'bg-white/60 dark:bg-[#171C27]/80 text-stone-700 dark:text-slate-300 border-stone-300/80 dark:border-slate-700/70 hover:bg-white dark:hover:bg-[#1E2534]'
                }`}
              >
                {g}
                {count > 0 && (
                  <span className="ml-1.5 opacity-75 font-mono-num">{count}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAddGenre}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-stone-400 dark:border-slate-600 text-stone-700 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Genre
          </button>
        </div>

        {genre !== 'All' && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={() => onTopicChange('All')}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                topic === 'All'
                  ? 'bg-stone-800 dark:bg-slate-200 text-white dark:text-slate-900 border-transparent'
                  : 'bg-white/50 dark:bg-[#141923] text-stone-600 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/60 hover:bg-white dark:hover:bg-[#1E2534]'
              }`}
            >
              All {genre}
            </button>
            {topicList.map((tp) => {
              const count = allBooks.filter((b) => b.g === genre && b.tp === tp).length;
              const active = topic === tp;
              return (
                <button
                  key={tp}
                  type="button"
                  onClick={() => onTopicChange(tp)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                    active
                      ? 'bg-stone-800 dark:bg-slate-200 text-white dark:text-slate-900 border-transparent'
                      : 'bg-white/50 dark:bg-[#141923] text-stone-600 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/60 hover:bg-white dark:hover:bg-[#1E2534]'
                  }`}
                >
                  {tp}
                  {count > 0 && (
                    <span className="ml-1.5 opacity-75 font-mono-num">{count}</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onAddTopic}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium border border-dashed border-stone-400 dark:border-slate-600 text-stone-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-[#1E2534] whitespace-nowrap shrink-0"
            >
              <Plus className="w-3 h-3" />
              Topic
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
          {(
            [
              ['all', 'All Books'],
              ['want', '🔖 Want to read'],
              ['reading', '📖 Reading'],
              ['read', '✅ Finished'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => onTabChange(k)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 border ${
                tab === k
                  ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent shadow-sm'
                  : 'bg-white/50 dark:bg-[#171C27]/70 text-stone-700 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/60 hover:bg-white dark:hover:bg-[#1E2534]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Physical Bookshelf Spine Showcase */}
      <div className="max-w-6xl mx-auto rounded-xl overflow-hidden border border-stone-300/70 dark:border-slate-800 shadow-lg">
        <div className="bookshelf-bay shelf-scroll flex items-end gap-1 overflow-x-auto px-5 pt-7 min-h-[245px]">
          {filteredBooks.length === 0 ? (
            <div className="w-full text-center py-16 text-sm text-stone-500 dark:text-slate-400">
              Your shelf is empty. Click “Add book” below to start building your reading archive.
            </div>
          ) : (
            filteredBooks.slice(0, 80).map((b) => {
              const c = computeHue(b.g || b.t);
              const h = 152 + ((b.t.length * 13 + c) % 68);
              const w = 30 + ((b.t.length * 3) % 16);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => handleBookPrimaryClick(b)}
                  onMouseEnter={(e) =>
                    setHoveredBook({ book: b, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHoveredBook({ book: b, x: e.clientX, y: e.clientY })
                  }
                  onMouseLeave={() => setHoveredBook(null)}
                  className="spine-item flex-none text-white/95 px-1.5 py-2.5 whitespace-nowrap overflow-hidden rounded-t-[3px] font-display font-semibold text-[13px] cursor-pointer text-left shadow-[inset_2px_0_3px_rgba(255,255,255,0.16),inset_-2px_0_4px_rgba(0,0,0,0.35)]"
                  style={{
                    background: `linear-gradient(90deg, hsl(${c} 44% 38%), hsl(${c} 48% 26%))`,
                    height: `${h}px`,
                    width: `${w}px`,
                  }}
                >
                  {b.t}
                </button>
              );
            })
          )}
        </div>
        <div className="bookshelf-plank" />
      </div>

      {/* Library Action Toolbar */}
      <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onAddBook}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-4 py-2 text-xs font-semibold hover:opacity-95 transition-opacity whitespace-nowrap shrink-0 shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            Add book
          </button>
          <button
            type="button"
            onClick={onOpenBulk}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            Bulk add
          </button>
          <button
            type="button"
            onClick={onOpenBackup}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-3.5 h-3.5" />
            Backup
          </button>
          <button
            type="button"
            onClick={onOpenRestore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            Restore
          </button>
          <button
            type="button"
            onClick={onRemoveDuplicates}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3.5 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 hover:bg-white dark:hover:bg-[#1E2534] transition-colors whitespace-nowrap shrink-0"
          >
            <CopyCheck className="w-3.5 h-3.5" />
            Remove duplicates
          </button>
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-xs text-stone-500 dark:text-slate-400">
            Sort
          </label>
          <select
            id="sort-select"
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOrder)}
            className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-3 py-2 text-xs font-medium text-stone-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#26428B] dark:focus:ring-[#D6A456]"
          >
            <option value="new">Newest</option>
            <option value="t">Title</option>
            <option value="a">Author</option>
            <option value="r">Rating</option>
          </select>
        </div>
      </div>

      {/* Book Card Grid */}
      <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-10">
        {visibleBooks.map((b) => {
          const c = computeHue(b.g || b.t);
          const progressPct = b.pt > 0 ? Math.min(100, ((b.pg || 0) / b.pt) * 100) : 0;
          const noteCount = annotationCounts[b.id] || 0;

          return (
            <article key={b.id} className="flex flex-col gap-2 group">
              <div
                onClick={() => handleBookPrimaryClick(b)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleBookPrimaryClick(b);
                  }
                }}
                className="relative aspect-[2/3] rounded-l-[3px] rounded-r-lg p-3 flex flex-col justify-between text-white cursor-pointer overflow-hidden shadow-[inset_6px_0_10px_-4px_rgba(0,0,0,0.45),0_10px_20px_-10px_rgba(0,0,0,0.5)] group-hover:-translate-y-1 transition-transform duration-150"
                style={
                  b.img
                    ? { background: `url(${b.img}) center/cover` }
                    : {
                        background: `linear-gradient(158deg, hsl(${c} 44% 40%), hsl(${(c + 24) % 360} 48% 24%))`,
                      }
                }
              >
                {!b.img && (
                  <>
                    <span className="text-[10px] tracking-wider uppercase opacity-80 truncate">
                      {b.g || 'Archive'}
                    </span>
                    <h3 className="font-display font-semibold text-lg leading-tight line-clamp-4">
                      {b.t}
                    </h3>
                    <span className="text-[10px] tracking-wider uppercase opacity-80 truncate">
                      {b.a || ''}
                    </span>
                  </>
                )}
              </div>

              <div className="space-y-0.5 min-w-0">
                <button
                  type="button"
                  onClick={() => handleBookPrimaryClick(b)}
                  className="text-left text-sm font-semibold text-stone-900 dark:text-slate-100 hover:text-[#26428B] dark:hover:text-[#D6A456] transition-colors line-clamp-2 leading-snug"
                >
                  {b.t}
                </button>

                <div className="text-xs text-stone-600 dark:text-slate-400 truncate">
                  {b.a ? (
                    <span>{b.a}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onEditBook(b.id)}
                      className="underline text-[#26428B] dark:text-[#D6A456] hover:opacity-80"
                    >
                      + add author
                    </button>
                  )}
                  {b.y && <span className="font-mono-num"> · {b.y}</span>}
                </div>

                {(b.g || b.tp || noteCount > 0) && (
                  <div className="text-[11px] text-stone-500 dark:text-slate-400 truncate">
                    {b.g}
                    {b.tp ? ` › ${b.tp}` : ''}
                    {noteCount > 0 ? `${b.g ? ' · ' : ''}${noteCount} marks` : ''}
                  </div>
                )}

                {b.rt > 0 && (
                  <div className="text-xs text-amber-600 dark:text-amber-400 tracking-tight">
                    {'★'.repeat(b.rt)}
                  </div>
                )}

                {b.pt > 0 && (
                  <div className="pt-1 space-y-1">
                    <div className="h-1 w-full bg-stone-300 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#26428B] dark:bg-[#D6A456] rounded-full"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="text-[11px] font-mono-num text-stone-500 dark:text-slate-400">
                      p. {b.pg || 0} / {b.pt}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-1 pt-1">
                {(['want', 'reading', 'read'] as const).map((k) => {
                  const active = b.status === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onToggleStatus(b, k)}
                      className={`px-2 py-1 rounded text-[10px] font-medium transition-colors whitespace-nowrap border ${
                        active
                          ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent'
                          : 'bg-white/60 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/70 hover:bg-white dark:hover:bg-[#1E2534]'
                      }`}
                    >
                      {STATUS_LABELS[k].icon} {STATUS_LABELS[k].label}
                    </button>
                  );
                })}
                {b.pdf && (
                  <button
                    type="button"
                    onClick={() => onOpenReader(b)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-[#26428B]/10 dark:bg-[#D6A456]/15 border border-[#26428B]/30 dark:border-[#D6A456]/40 text-[#26428B] dark:text-[#D6A456] hover:opacity-85 whitespace-nowrap"
                  >
                    <FileText className="w-3 h-3" />
                    Read PDF
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onEditBook(b.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium border border-stone-300/70 dark:border-slate-700/70 bg-white/60 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#1E2534] whitespace-nowrap"
                >
                  <Edit3 className="w-3 h-3" />
                  Edit
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {filteredBooks.length > limit && (
        <div className="text-center pb-8">
          <button
            type="button"
            onClick={onLoadMore}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-5 py-2.5 text-xs font-medium hover:bg-white dark:hover:bg-[#1E2534] transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Show more ({filteredBooks.length - limit} left)
          </button>
        </div>
      )}

      {/* Floating Spine Tooltip */}
      {hoveredBook && (
        <div
          className="fixed z-50 w-56 pointer-events-none rounded-lg bg-[#FCF8EE] text-stone-900 p-3 shadow-xl border border-stone-300/80"
          style={{
            left: Math.min(hoveredBook.x + 14, window.innerWidth - 240),
            top: Math.max(hoveredBook.y - 104, 12),
          }}
        >
          <div className="font-display font-semibold text-base leading-tight">
            {hoveredBook.book.t}
          </div>
          <div className="text-[11px] font-medium text-[#26428B] mt-0.5">
            {hoveredBook.book.a || 'Author unknown'}
          </div>
          <div className="text-[11px] text-stone-600 mt-1">
            {hoveredBook.book.g || 'Uncategorized'}
            {hoveredBook.book.tp ? ` › ${hoveredBook.book.tp}` : ''}
            {hoveredBook.book.y ? ` · ${hoveredBook.book.y}` : ''}
          </div>
          <div className="text-[11px] text-stone-500 mt-0.5 font-mono-num">
            {hoveredBook.book.status
              ? `${STATUS_LABELS[hoveredBook.book.status].icon} ${STATUS_LABELS[hoveredBook.book.status].label}`
              : 'Unassigned'}
            {hoveredBook.book.rt > 0 ? ` · ${'★'.repeat(hoveredBook.book.rt)}` : ''}
            {hoveredBook.book.pt > 0
              ? ` · p. ${hoveredBook.book.pg || 0}/${hoveredBook.book.pt}`
              : ''}
          </div>
        </div>
      )}
    </div>
  );
};
