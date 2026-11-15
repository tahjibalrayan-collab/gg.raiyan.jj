import React, { useEffect, useRef, useState } from 'react';
import { Book, BookStatus, DEFAULT_GENRES, LibraryMeta, STATUS_LABELS } from '../types';
import { idbDelete, idbPut } from '../lib/idb';
import { nid } from '../lib/archiveUtils';
import { FileText, Image as ImageIcon, Link as LinkIcon, Trash2, X } from 'lucide-react';

interface BookModalProps {
  isOpen: boolean;
  book: Book | null;
  allBooks: Book[];
  meta: LibraryMeta;
  defaultGenre: string;
  defaultTopic: string;
  onClose: () => void;
  onSave: (book: Book) => void;
  onDelete: (bookId: string) => void;
  onOpenReader: (book: Book) => void;
  onToast: (msg: string) => void;
}

export const BookModal: React.FC<BookModalProps> = ({
  isOpen,
  book,
  allBooks,
  meta,
  defaultGenre,
  defaultTopic,
  onClose,
  onSave,
  onDelete,
  onOpenReader,
  onToast,
}) => {
  const [draftId, setDraftId] = useState('');
  const [t, setT] = useState('');
  const [a, setA] = useState('');
  const [g, setG] = useState('');
  const [tp, setTp] = useState('');
  const [y, setY] = useState('');
  const [status, setStatus] = useState<BookStatus>('want');
  const [rt, setRt] = useState(0);
  const [pt, setPt] = useState('');
  const [pg, setPg] = useState('');
  const [nt, setNt] = useState('');
  const [img, setImg] = useState<string | undefined>(undefined);
  const [pdf, setPdf] = useState<string | undefined>(undefined);
  const [showPdfUrlInput, setShowPdfUrlInput] = useState(false);
  const [pdfUrlDraft, setPdfUrlDraft] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  const imgInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const id = book?.id || nid();
    setDraftId(id);
    setT(book?.t || '');
    setA(book?.a || '');
    setG(book?.g || (defaultGenre !== 'All' ? defaultGenre : ''));
    setTp(book?.tp || (defaultTopic !== 'All' ? defaultTopic : ''));
    setY(book?.y || '');
    setStatus(book?.status || 'want');
    setRt(book?.rt || 0);
    setPt(book?.pt ? String(book.pt) : '');
    setPg(book?.pg ? String(book.pg) : '');
    setNt(book?.nt || '');
    setImg(book?.img);
    setPdf(book?.pdf);
    setPdfUrlDraft(book?.pdf && book.pdf !== 'local' ? book.pdf : '');
    setShowPdfUrlInput(false);
    setConfirmDel(false);
  }, [isOpen, book, defaultGenre, defaultTopic]);

  if (!isOpen) return null;

  const genreOptions = Array.from(
    new Set([...DEFAULT_GENRES, ...meta.gx, ...allBooks.map((x) => x.g).filter(Boolean)])
  );
  const topicOptions = Array.from(
    new Set([
      ...Object.values(meta.tp).flat(),
      ...allBooks.map((x) => x.tp).filter(Boolean),
    ])
  );
  const authorOptions = Array.from(new Set(allBooks.map((x) => x.a).filter(Boolean)));

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 360;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const ratio = Math.max(240 / image.width, 360 / image.height);
        const w = image.width * ratio;
        const h = image.height * ratio;
        ctx.drawImage(image, (240 - w) / 2, (360 - h) / 2, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.78);
        setImg(dataUrl);
        idbPut(`img:${draftId}`, dataUrl).catch(() => {});
        onToast('Cover photo updated');
      }
      URL.revokeObjectURL(objectUrl);
      e.target.value = '';
    };
    image.src = objectUrl;
  };

  const handleLocalPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await idbPut(draftId, file);
      setPdf('local');
      setPdfUrlDraft('');
      setShowPdfUrlInput(false);
      onToast('PDF saved locally on this device');
    } catch {
      onToast('Could not save this PDF locally');
    }
    e.target.value = '';
  };

  const handleApplyPdfUrl = () => {
    const trimmed = pdfUrlDraft.trim();
    if (!trimmed) {
      setPdf(undefined);
      setShowPdfUrlInput(false);
      return;
    }
    if (!/^https?:\/\//i.test(trimmed)) {
      onToast('Please enter a valid http:// or https:// PDF link');
      return;
    }
    setPdf(trimmed);
    setShowPdfUrlInput(false);
    onToast('PDF link attached (syncs across devices)');
  };

  const handleOpenPdf = () => {
    if (!pdf) return;
    const currentDraft: Book = {
      id: draftId,
      t: t.trim() || 'Untitled Book',
      a: a.trim(),
      g: g.trim(),
      tp: tp.trim(),
      y: y.trim(),
      status,
      rt,
      pt: Math.max(0, Number(pt) || 0),
      pg: Math.max(0, Number(pg) || 0),
      nt,
      img,
      pdf,
      ts: book?.ts || Date.now(),
    };
    onSave(currentDraft);
    onClose();
    onOpenReader(currentDraft);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = t.trim();
    if (!trimmedTitle) {
      onToast('Please enter a book title');
      return;
    }
    const nextBook: Book = {
      id: draftId,
      t: trimmedTitle,
      a: a.trim(),
      g: g.trim(),
      tp: tp.trim(),
      y: y.trim(),
      status,
      rt,
      pt: Math.max(0, Number(pt) || 0),
      pg: Math.max(0, Number(pg) || 0),
      nt,
      img,
      pdf,
      ts: book?.ts || Date.now(),
    };
    onSave(nextBook);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-xl border border-stone-200 dark:border-slate-700/80 bg-[#FAF7F0] dark:bg-[#151A25] text-stone-900 dark:text-slate-100 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-slate-800 pb-3 mb-4">
          <h2 className="font-display text-2xl font-semibold">
            {book ? 'Edit Book' : 'Add a Book'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:text-slate-400 dark:hover:text-white hover:bg-stone-200/60 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
              Title
            </label>
            <input
              value={t}
              onChange={(e) => setT(e.target.value)}
              placeholder="Book title"
              required
              className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
              Author
            </label>
            <input
              value={a}
              onChange={(e) => setA(e.target.value)}
              list="modal-authors"
              placeholder="Author name"
              className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Genre
              </label>
              <input
                value={g}
                onChange={(e) => setG(e.target.value)}
                list="modal-genres"
                placeholder="Genre"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Topic / Type
              </label>
              <input
                value={tp}
                onChange={(e) => setTp(e.target.value)}
                list="modal-topics"
                placeholder="Topic or sub-genre"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Year
              </label>
              <input
                value={y}
                onChange={(e) => setY(e.target.value)}
                placeholder="e.g. 2024"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Reading Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as BookStatus)}
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              >
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.icon} {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Rating
              </label>
              <select
                value={rt}
                onChange={(e) => setRt(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              >
                <option value={0}>No rating</option>
                <option value={1}>★</option>
                <option value={2}>★★</option>
                <option value={3}>★★★</option>
                <option value={4}>★★★★</option>
                <option value={5}>★★★★★</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Total Pages
              </label>
              <input
                type="number"
                min={0}
                value={pt}
                onChange={(e) => setPt(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
                Pages Read
              </label>
              <input
                type="number"
                min={0}
                value={pg}
                onChange={(e) => setPg(e.target.value)}
                placeholder="0"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm font-mono-num focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 dark:text-slate-400 mb-1">
              Notes
            </label>
            <textarea
              rows={3}
              value={nt}
              onChange={(e) => setNt(e.target.value)}
              placeholder="Reflections, quotes, or reminders…"
              className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
            />
          </div>

          {/* Media & PDF Section */}
          <div className="pt-2 border-t border-stone-200 dark:border-slate-800 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => imgInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#1E2534] px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {img ? 'Change cover' : 'Add cover photo'}
              </button>

              {img && (
                <button
                  type="button"
                  onClick={() => {
                    setImg(undefined);
                    idbDelete(`img:${draftId}`).catch(() => {});
                  }}
                  className="text-xs text-stone-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 px-2 py-1"
                >
                  Remove cover
                </button>
              )}

              <button
                type="button"
                onClick={() => pdfInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#1E2534] px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                {pdf === 'local' ? 'Replace local PDF' : 'Upload local PDF'}
              </button>

              <button
                type="button"
                onClick={() => setShowPdfUrlInput((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#1E2534] px-3 py-1.5 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                {pdf && pdf !== 'local' ? 'Edit PDF link' : 'Add PDF link'}
              </button>

              {pdf && (
                <button
                  type="button"
                  onClick={handleOpenPdf}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-900 text-white dark:bg-amber-500 dark:text-slate-950 px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Open PDF
                </button>
              )}
            </div>

            {pdf === 'local' && (
              <p className="text-[11px] text-stone-500 dark:text-slate-400">
                Local PDF stored on this device. For mobile access, attach an online Google Drive or web PDF link.
              </p>
            )}

            {showPdfUrlInput && (
              <div className="flex gap-2">
                <input
                  value={pdfUrlDraft}
                  onChange={(e) => setPdfUrlDraft(e.target.value)}
                  placeholder="https://drive.google.com/... or direct PDF URL"
                  className="flex-1 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
                />
                <button
                  type="button"
                  onClick={handleApplyPdfUrl}
                  className="rounded-lg bg-stone-900 dark:bg-slate-200 text-white dark:text-slate-900 px-3 py-1.5 text-xs font-medium whitespace-nowrap"
                >
                  Apply Link
                </button>
              </div>
            )}
          </div>

          <input
            ref={imgInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleCoverUpload}
          />
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleLocalPdfUpload}
          />

          <datalist id="modal-genres">
            {genreOptions.map((val) => (
              <option key={val} value={val} />
            ))}
          </datalist>
          <datalist id="modal-topics">
            {topicOptions.map((val) => (
              <option key={val} value={val} />
            ))}
          </datalist>
          <datalist id="modal-authors">
            {authorOptions.map((val) => (
              <option key={val} value={val} />
            ))}
          </datalist>

          <div className="flex items-center justify-between pt-4 border-t border-stone-200 dark:border-slate-800">
            <div>
              {book && !confirmDel && (
                <button
                  type="button"
                  onClick={() => setConfirmDel(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 px-3 py-2 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              )}
              {book && confirmDel && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(book.id);
                      onClose();
                    }}
                    className="rounded-lg bg-red-600 text-white px-3 py-2 text-xs font-semibold hover:bg-red-700"
                  >
                    Confirm Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDel(false)}
                    className="text-xs text-stone-500 hover:text-stone-800 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-stone-300 dark:border-slate-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-800 transition-colors"
              >
                Close
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-5 py-2 text-xs font-semibold hover:opacity-95 transition-opacity"
              >
                Save Book
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
