import React, { useEffect, useRef, useState } from 'react';
import { Book, DiaryPage, LibraryMeta } from '../types';
import { Copy, Download, Upload, X } from 'lucide-react';

export type TextModalMode = 'backup' | 'restore' | 'bulk';

interface TextActionModalProps {
  isOpen: boolean;
  mode: TextModalMode;
  defaultScope?: 'full' | 'diary';
  books: Record<string, Book>;
  meta: LibraryMeta;
  diary: DiaryPage[];
  onClose: () => void;
  onRestore: (payload: {
    B?: Record<string, Partial<Book>>;
    M?: Partial<LibraryMeta>;
    D?: Partial<DiaryPage>[];
  }) => void;
  onBulkAdd: (linesText: string) => void;
  onToast: (msg: string) => void;
}

export const TextActionModal: React.FC<TextActionModalProps> = ({
  isOpen,
  mode,
  defaultScope = 'full',
  books,
  meta,
  diary,
  onClose,
  onRestore,
  onBulkAdd,
  onToast,
}) => {
  const [scope, setScope] = useState<'full' | 'diary'>(defaultScope);
  const [text, setText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const buildBackupJson = (selectedScope: 'full' | 'diary') => {
    if (selectedScope === 'diary') {
      return JSON.stringify({ D: diary });
    }
    const cleanBooks: Record<string, Omit<Book, 'img'>> = {};
    for (const k of Object.keys(books)) {
      const copy: Book = { ...books[k] };
      delete copy.img;
      if (copy.pdf === 'local') {
        delete copy.pdf;
      }
      cleanBooks[k] = copy;
    }
    return JSON.stringify({ B: cleanBooks, M: meta, D: diary });
  };

  useEffect(() => {
    if (!isOpen) return;
    setScope(defaultScope);
    if (mode === 'backup') {
      setText(buildBackupJson(defaultScope));
    } else {
      setText('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode, defaultScope]);

  if (!isOpen) return null;

  const handleScopeChange = (nextScope: 'full' | 'diary') => {
    setScope(nextScope);
    if (mode === 'backup') {
      setText(buildBackupJson(nextScope));
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      onToast('Backup text copied to clipboard');
    } catch {
      onToast('Select all and copy the text manually');
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download =
      scope === 'diary'
        ? `rayan-diary-backup-${dateStamp}.json`
        : `rayan-archive-backup-${dateStamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onToast('Backup JSON file downloaded');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setText(reader.result);
        onToast('Backup file loaded. Click Restore now to apply.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirm = () => {
    if (mode === 'backup') {
      void handleCopy();
      return;
    }
    if (mode === 'restore') {
      if (!text.trim()) {
        onToast('Paste backup JSON or upload a .json file first');
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          onRestore({ D: parsed });
        } else if (parsed && typeof parsed === 'object') {
          onRestore(parsed);
        } else {
          onToast('Invalid backup format');
          return;
        }
        onClose();
      } catch {
        onToast('Could not read that backup text. Please check JSON formatting.');
      }
      return;
    }
    if (mode === 'bulk') {
      if (!text.trim()) {
        onToast('Enter at least one book title');
        return;
      }
      onBulkAdd(text);
      onClose();
    }
  };

  const titles: Record<TextModalMode, string> = {
    backup: scope === 'diary' ? 'Backup Diary' : 'Backup Full Archive',
    restore: 'Restore Books & Diary',
    bulk: 'Bulk Add Books',
  };

  const descriptions: Record<TextModalMode, string> = {
    backup:
      scope === 'diary'
        ? 'Copy this text or download the .json file to keep your diary pages safe.'
        : 'Includes books, genres, topics, PDF links, and all diary pages. Copy or download as a .json file.',
    restore:
      'Paste your backup text below or upload a .json backup file to restore books, genres, topics, and diary pages.',
    bulk: 'One book per line: Title - Author - Genre - Topic - Note (everything after title is optional). All go to Want to read.',
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-stone-200 dark:border-slate-700/80 bg-[#FAF7F0] dark:bg-[#151A25] text-stone-900 dark:text-slate-100 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 pb-3 mb-3">
          <h2 className="font-display text-2xl font-semibold">{titles[mode]}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:text-slate-400 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-slate-800"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs leading-relaxed text-stone-600 dark:text-slate-400 mb-3">
          {descriptions[mode]}
        </p>

        {mode === 'backup' && (
          <div className="flex items-center gap-1 p-1 bg-stone-200/70 dark:bg-[#0E121B] rounded-lg w-fit mb-3">
            <button
              type="button"
              onClick={() => handleScopeChange('full')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'full'
                  ? 'bg-white dark:bg-[#1E2534] text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-600 dark:text-slate-400'
              }`}
            >
              Full Archive (Library + Diary)
            </button>
            <button
              type="button"
              onClick={() => handleScopeChange('diary')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                scope === 'diary'
                  ? 'bg-white dark:bg-[#1E2534] text-stone-900 dark:text-white shadow-sm'
                  : 'text-stone-600 dark:text-slate-400'
              }`}
            >
              Diary Only
            </button>
          </div>
        )}

        {mode === 'restore' && (
          <div className="mb-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#1E2534] px-3 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Upload .json Backup File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json,text/plain"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        )}

        <textarea
          rows={9}
          value={text}
          readOnly={mode === 'backup'}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            mode === 'bulk'
              ? 'Atomic Habits - James Clear - Self-Help - Habits - Must read\nThe Sealed Nectar - Safiur Rahman - History - Islamic'
              : mode === 'restore'
                ? 'Paste your backup JSON text here…'
                : ''
          }
          className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2.5 text-xs font-mono-num focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
        />

        <div className="flex flex-wrap items-center justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 dark:border-slate-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
          >
            Close
          </button>

          {mode === 'backup' && (
            <button
              type="button"
              onClick={handleDownloadJson}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#1E2534] px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download .json
            </button>
          )}

          <button
            type="button"
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-5 py-2 text-xs font-semibold hover:opacity-95 transition-opacity"
          >
            {mode === 'backup' && <Copy className="w-3.5 h-3.5" />}
            {mode === 'backup' ? 'Copy Text' : mode === 'restore' ? 'Restore Now' : 'Add Books'}
          </button>
        </div>
      </div>
    </div>
  );
};
