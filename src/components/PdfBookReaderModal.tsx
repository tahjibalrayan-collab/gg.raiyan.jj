import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  Book,
  BookAnnotation,
  HIGHLIGHT_COLORS,
  HighlightColor,
  NormPoint,
  NormRect,
} from '../types';
import { idbGet } from '../lib/idb';
import { nid, toInAppEmbedUrl } from '../lib/archiveUtils';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Highlighter,
  MessageSquarePlus,
  PanelRightClose,
  PanelRightOpen,
  PenTool,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfBookReaderModalProps {
  isOpen: boolean;
  book: Book | null;
  annotations: BookAnnotation[];
  onClose: () => void;
  onEditBookDetails: (bookId: string) => void;
  onUpdatePageProgress: (book: Book, page: number, totalPages?: number) => void;
  onSaveAnnotation: (ann: BookAnnotation) => void;
  onDeleteAnnotation: (annId: string) => void;
  onToast: (msg: string) => void;
}

type PaperTint = 'white' | 'sepia' | 'night';

interface PendingSelection {
  quote: string;
  rects: NormRect[];
  xPx: number;
  yPx: number;
}

export const PdfBookReaderModal: React.FC<PdfBookReaderModalProps> = ({
  isOpen,
  book,
  annotations,
  onClose,
  onEditBookDetails,
  onUpdatePageProgress,
  onSaveAnnotation,
  onDeleteAnnotation,
  onToast,
}) => {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [loading, setLoading] = useState(false);
  const [embedFallbackUrl, setEmbedFallbackUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [pageNum, setPageNum] = useState(1);
  const [numPages, setNumPages] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [paperTint, setPaperTint] = useState<PaperTint>('sepia');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarFilter, setSidebarFilter] = useState<'page' | 'all'>('page');

  // Tools
  const [activeColor, setActiveColor] = useState<HighlightColor>('yellow');
  const [penMode, setPenMode] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [drawingPoints, setDrawingPoints] = useState<NormPoint[] | null>(null);

  // Note / explanation editor state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [explanationDraft, setExplanationDraft] = useState('');
  const [newPageNoteOpen, setNewPageNoteOpen] = useState(false);
  const [newPageNoteQuote, setNewPageNoteQuote] = useState('');
  const [newPageNoteText, setNewPageNoteText] = useState('');

  const pageBoxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);
  const textLayerInstanceRef = useRef<pdfjsLib.TextLayer | null>(null);

  const bookAnnotations = useMemo(
    () =>
      book
        ? annotations
            .filter((a) => a.bookId === book.id)
            .sort((a, b) => a.page - b.page || a.ts - b.ts)
        : [],
    [annotations, book]
  );

  const pageAnnotations = useMemo(
    () => bookAnnotations.filter((a) => a.page === pageNum),
    [bookAnnotations, pageNum]
  );

  const sidebarList = sidebarFilter === 'page' ? pageAnnotations : bookAnnotations;

  // Load PDF document when modal opens
  useEffect(() => {
    if (!isOpen || !book || !book.pdf) {
      setPdfDoc(null);
      setEmbedFallbackUrl(null);
      setLoadError(null);
      return;
    }

    const pdfSrc = book.pdf;
    const bookId = book.id;
    const defaultPage = book.pg;
    const fallbackTotalPages = book.pt;
    let cancelled = false;
    let loadedTask: pdfjsLib.PDFDocumentLoadingTask | null = null;
    let loadedDoc: pdfjsLib.PDFDocumentProxy | null = null;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      setEmbedFallbackUrl(null);
      setPendingSelection(null);

      try {
        if (pdfSrc === 'local') {
          const blob = await idbGet<Blob>(bookId);
          if (!blob) {
            if (!cancelled) {
              setLoadError(
                'This local PDF was saved only on the device where it was uploaded.'
              );
            }
            return;
          }
          const buffer = await blob.arrayBuffer();
          loadedTask = pdfjsLib.getDocument({ data: buffer });
          loadedDoc = await loadedTask.promise;
        } else {
          try {
            const resp = await fetch(pdfSrc);
            if (!resp.ok) throw new Error('Fetch failed');
            const buffer = await resp.arrayBuffer();
            loadedTask = pdfjsLib.getDocument({ data: buffer });
            loadedDoc = await loadedTask.promise;
          } catch {
            // External URL blocked CORS (e.g., Google Drive): stay inside app domain via embedded viewer!
            if (!cancelled) {
              setEmbedFallbackUrl(toInAppEmbedUrl(pdfSrc));
              setNumPages(fallbackTotalPages || 1);
              setPageNum(Math.max(1, defaultPage || 1));
            }
            return;
          }
        }

        if (cancelled) {
          await loadedTask.destroy();
          return;
        }

        setPdfDoc(loadedDoc);
        setNumPages(loadedDoc.numPages);
        const startPage =
          defaultPage && defaultPage >= 1 && defaultPage <= loadedDoc.numPages
            ? defaultPage
            : 1;
        setPageNum(startPage);
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : 'Unable to open this PDF inside the reader.'
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (loadedTask) {
        void loadedTask.destroy();
      }
    };
  }, [isOpen, book?.id, book?.pdf]);

  // Render active PDF page + text layer
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current || !textLayerRef.current || !pageBoxRef.current) {
      return;
    }

    let cancelled = false;

    const renderPage = async () => {
      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
          renderTaskRef.current = null;
        }
        if (textLayerInstanceRef.current) {
          textLayerInstanceRef.current.cancel();
          textLayerInstanceRef.current = null;
        }

        const page = await pdfDoc.getPage(pageNum);
        if (cancelled) return;

        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        pageBoxRef.current!.style.width = `${viewport.width}px`;
        pageBoxRef.current!.style.height = `${viewport.height}px`;
        pageBoxRef.current!.style.setProperty('--scale-factor', String(scale));
        pageBoxRef.current!.style.setProperty('--total-scale-factor', String(scale));

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const renderTask = page.render({
          canvasContext: ctx,
          viewport,
          canvas,
        });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        const textContent = await page.getTextContent();
        if (cancelled) return;

        const textContainer = textLayerRef.current!;
        textContainer.innerHTML = '';
        textContainer.style.width = `${viewport.width}px`;
        textContainer.style.height = `${viewport.height}px`;

        const tl = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textContainer,
          viewport,
        });
        textLayerInstanceRef.current = tl;
        await tl.render();
      } catch (err) {
        if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      }
    };

    void renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (textLayerInstanceRef.current) {
        textLayerInstanceRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  const goToPage = useCallback(
    (target: number) => {
      if (!book) return;
      const clamped = Math.min(Math.max(1, target), Math.max(1, numPages));
      setPageNum(clamped);
      setPendingSelection(null);
      onUpdatePageProgress(book, clamped, pdfDoc ? numPages : undefined);
    },
    [book, numPages, onUpdatePageProgress, pdfDoc]
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') goToPage(pageNum + 1);
      if (e.key === 'ArrowLeft') goToPage(pageNum - 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, pageNum, goToPage, onClose]);

  // Handle text selection for line-by-line highlighting
  const handleTextSelection = () => {
    if (penMode || !pageBoxRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setPendingSelection(null);
      return;
    }
    const quote = sel.toString().trim();
    if (!quote) {
      setPendingSelection(null);
      return;
    }

    const range = sel.getRangeAt(0);
    const boxRect = pageBoxRef.current.getBoundingClientRect();
    if (
      !pageBoxRef.current.contains(range.commonAncestorContainer) ||
      boxRect.width === 0 ||
      boxRect.height === 0
    ) {
      return;
    }

    const rawRects = Array.from(range.getClientRects()).filter(
      (r) => r.width > 2 && r.height > 2
    );
    if (rawRects.length === 0) return;

    // Normalize & deduplicate overlapping line boxes
    const rects: NormRect[] = rawRects.slice(0, 120).map((r) => ({
      x: Math.max(0, (r.left - boxRect.left) / boxRect.width),
      y: Math.max(0, (r.top - boxRect.top) / boxRect.height),
      w: Math.min(1, r.width / boxRect.width),
      h: Math.min(1, r.height / boxRect.height),
    }));

    const firstRect = rawRects[0];
    setPendingSelection({
      quote,
      rects,
      xPx: Math.min(Math.max(16, firstRect.left - boxRect.left), boxRect.width - 230),
      yPx: Math.max(8, firstRect.top - boxRect.top - 48),
    });
  };

  const commitHighlight = (color: HighlightColor, withExplanationPrompt = false) => {
    if (!book || !pendingSelection) return;
    const ann: BookAnnotation = {
      id: nid(),
      bookId: book.id,
      page: pageNum,
      kind: 'highlight',
      color,
      quote: pendingSelection.quote,
      explanation: '',
      rects: pendingSelection.rects,
      ts: Date.now(),
    };
    onSaveAnnotation(ann);
    setActiveColor(color);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();

    if (withExplanationPrompt) {
      setSidebarOpen(true);
      setSidebarFilter('page');
      setEditingNoteId(ann.id);
      setExplanationDraft('');
    }
    onToast('Highlighted line saved');
  };

  // Freehand Margin Ink / Pen drawing handlers
  const getNormalizedPoint = (e: React.PointerEvent<SVGSVGElement>): NormPoint | null => {
    if (!pageBoxRef.current) return null;
    const rect = pageBoxRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleInkDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!penMode) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = getNormalizedPoint(e);
    if (pt) setDrawingPoints([pt]);
  };

  const handleInkMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!penMode || !drawingPoints) return;
    const pt = getNormalizedPoint(e);
    if (!pt) return;
    setDrawingPoints((prev) => (prev && prev.length < 550 ? [...prev, pt] : prev));
  };

  const handleInkUp = () => {
    if (!penMode || !drawingPoints || !book) {
      setDrawingPoints(null);
      return;
    }
    if (drawingPoints.length >= 2) {
      const ann: BookAnnotation = {
        id: nid(),
        bookId: book.id,
        page: pageNum,
        kind: 'ink',
        color: activeColor,
        quote: `Margin mark on p. ${pageNum}`,
        explanation: '',
        points: drawingPoints,
        ts: Date.now(),
      };
      onSaveAnnotation(ann);
    }
    setDrawingPoints(null);
  };

  const handleAddStandaloneNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!book || !newPageNoteText.trim()) return;
    const ann: BookAnnotation = {
      id: nid(),
      bookId: book.id,
      page: pageNum,
      kind: 'note',
      color: activeColor,
      quote: newPageNoteQuote.trim() || `Page ${pageNum} Note`,
      explanation: newPageNoteText.trim(),
      ts: Date.now(),
    };
    onSaveAnnotation(ann);
    setNewPageNoteQuote('');
    setNewPageNoteText('');
    setNewPageNoteOpen(false);
    onToast('Page note saved');
  };

  const handleSaveExplanation = (ann: BookAnnotation) => {
    onSaveAnnotation({
      ...ann,
      explanation: explanationDraft.trim(),
    });
    setEditingNoteId(null);
    setExplanationDraft('');
    onToast('Explanation updated');
  };

  if (!isOpen || !book) return null;

  const tintClass =
    paperTint === 'sepia'
      ? 'bg-[#ECE3D2] dark:bg-[#191612]'
      : paperTint === 'night'
        ? 'bg-[#0D1017]'
        : 'bg-stone-200 dark:bg-[#11151E]';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0E121B] text-slate-100">
      {/* Top Reader Toolbar */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-slate-800 bg-[#131824] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/70 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            Back to Library
          </button>

          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-white truncate">
              {book.t}
            </h2>
            <p className="text-[11px] text-slate-400 truncate">
              {book.a || 'Book Reader'}
              {numPages > 1 ? ` · Page ${pageNum} of ${numPages}` : ''}
            </p>
          </div>
        </div>

        {/* Highlight Color Picker + Margin Pen + Zoom + Paper Tint */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 4 Color Highlighter Swatches */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#0C1018] border border-slate-800">
            <Highlighter className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
            {(['green', 'blue', 'red', 'yellow'] as HighlightColor[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveColor(c)}
                title={`${HIGHLIGHT_COLORS[c].label} marker`}
                className={`w-5 h-5 rounded-full transition-transform ${
                  activeColor === c ? 'ring-2 ring-white scale-110' : 'opacity-75 hover:opacity-100'
                }`}
                style={{ backgroundColor: HIGHLIGHT_COLORS[c].swatch }}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setPenMode((p) => !p);
              setPendingSelection(null);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap ${
              penMode
                ? 'bg-amber-500 text-slate-950 border-amber-400'
                : 'border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            {penMode ? 'Pen On (Draw Margin)' : 'Margin Pen'}
          </button>

          {pdfDoc && (
            <>
              <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => goToPage(pageNum - 1)}
                  disabled={pageNum <= 1}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={numPages}
                  value={pageNum}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 1 && v <= numPages) goToPage(v);
                  }}
                  className="w-12 bg-transparent text-center text-xs font-mono-num focus:outline-none"
                />
                <span className="text-xs text-slate-400 font-mono-num pr-1">
                  / {numPages}
                </span>
                <button
                  type="button"
                  onClick={() => goToPage(pageNum + 1)}
                  disabled={pageNum >= numPages}
                  className="p-1 rounded hover:bg-slate-700 disabled:opacity-30"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-1.5 py-1">
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.max(0.75, +(s - 0.15).toFixed(2)))}
                  className="p-1 rounded hover:bg-slate-700"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs font-mono-num px-1">
                  {Math.round(scale * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setScale((s) => Math.min(2.2, +(s + 0.15).toFixed(2)))}
                  className="p-1 rounded hover:bg-slate-700"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}

          <select
            value={paperTint}
            onChange={(e) => setPaperTint(e.target.value as PaperTint)}
            aria-label="Reading paper theme"
            className="rounded-lg border border-slate-700 bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200"
          >
            <option value="sepia">Warm Book Paper</option>
            <option value="white">Crisp White</option>
            <option value="night">Night Ink</option>
          </select>

          <button
            type="button"
            onClick={() => onEditBookDetails(book.id)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-700 whitespace-nowrap"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Book Info
          </button>

          <button
            type="button"
            onClick={() => setSidebarOpen((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D6A456] text-slate-950 px-3 py-1.5 text-xs font-semibold hover:opacity-95 whitespace-nowrap"
          >
            {sidebarOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            Notes ({bookAnnotations.length})
          </button>
        </div>
      </header>

      {/* Main Split Reader Workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
        {/* Book Page Canvas Viewport */}
        <div className={`flex-1 overflow-auto p-4 sm:p-8 flex justify-center items-start ${tintClass}`}>
          {loading && (
            <div className="my-auto text-center space-y-2 py-20 text-stone-700 dark:text-slate-300">
              <BookOpen className="w-8 h-8 mx-auto animate-pulse" />
              <p className="text-sm font-medium">Opening book inside Personal Archive…</p>
            </div>
          )}

          {!loading && loadError && (
            <div className="my-auto max-w-md rounded-xl border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#151A25] p-6 text-center space-y-3 text-stone-800 dark:text-slate-200 shadow-lg">
              <p className="font-display text-xl font-semibold">PDF Unavailable Here</p>
              <p className="text-xs leading-relaxed text-stone-600 dark:text-slate-400">
                {loadError}
              </p>
              <button
                type="button"
                onClick={() => onEditBookDetails(book.id)}
                className="rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-4 py-2 text-xs font-semibold"
              >
                Update Book PDF
              </button>
            </div>
          )}

          {!loading && !loadError && embedFallbackUrl && (
            <div className="w-full h-full min-h-[75vh] flex flex-col gap-2">
              <div className="text-xs px-3 py-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200">
                Opened inside your archive domain. For direct line-by-line text highlighting on the page, upload the PDF file from your device in Book Info; external Google Drive PDFs still support full page-by-page notes & explanations in the right panel.
              </div>
              <iframe
                src={embedFallbackUrl}
                title={book.t}
                className="w-full flex-1 rounded-xl border border-stone-300 dark:border-slate-700 bg-white"
              />
            </div>
          )}

          {!loading && !loadError && pdfDoc && (
            <div
              ref={pageBoxRef}
              onMouseUp={handleTextSelection}
              onTouchEnd={handleTextSelection}
              className={`relative shadow-2xl border border-stone-400/40 bg-white select-text ${
                paperTint === 'sepia'
                  ? 'sepia-[.18] contrast-[.98]'
                  : paperTint === 'night'
                    ? 'invert-[.9] hue-rotate-180'
                    : ''
              }`}
            >
              <canvas ref={canvasRef} className="block" />

              {/* Saved Highlights Layer */}
              <div className="absolute inset-0 pointer-events-none z-[1]">
                {pageAnnotations
                  .filter((a) => a.kind === 'highlight' && a.rects)
                  .map((ann) =>
                    ann.rects!.map((r, idx) => (
                      <div
                        key={`${ann.id}-${idx}`}
                        style={{
                          left: `${r.x * 100}%`,
                          top: `${r.y * 100}%`,
                          width: `${r.w * 100}%`,
                          height: `${r.h * 100}%`,
                          backgroundColor: HIGHLIGHT_COLORS[ann.color].bg,
                          borderBottom: `2px solid ${HIGHLIGHT_COLORS[ann.color].border}`,
                        }}
                        className="absolute rounded-[2px]"
                      />
                    ))
                  )}
              </div>

              {/* Selectable PDF Text Layer */}
              <div
                ref={textLayerRef}
                className={`textLayer ${penMode ? 'pointer-events-none' : ''}`}
              />

              {/* Freehand Margin Ink SVG Overlay */}
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onPointerDown={handleInkDown}
                onPointerMove={handleInkMove}
                onPointerUp={handleInkUp}
                className={`absolute inset-0 w-full h-full z-[3] ${
                  penMode ? 'cursor-crosshair touch-none' : 'pointer-events-none'
                }`}
              >
                {pageAnnotations
                  .filter((a) => a.kind === 'ink' && a.points && a.points.length > 1)
                  .map((ann) => (
                    <polyline
                      key={ann.id}
                      fill="none"
                      stroke={HIGHLIGHT_COLORS[ann.color].swatch}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity="0.82"
                      points={ann
                        .points!.map((p) => `${p.x * 1000},${p.y * 1000}`)
                        .join(' ')}
                    />
                  ))}
                {drawingPoints && drawingPoints.length > 1 && (
                  <polyline
                    fill="none"
                    stroke={HIGHLIGHT_COLORS[activeColor].swatch}
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={drawingPoints
                      .map((p) => `${p.x * 1000},${p.y * 1000}`)
                      .join(' ')}
                  />
                )}
              </svg>

              {/* Floating Selection Highlighter Toolbar */}
              {pendingSelection && (
                <div
                  className="absolute z-20 flex items-center gap-1.5 rounded-xl bg-slate-900 text-white px-2.5 py-1.5 shadow-2xl border border-slate-700"
                  style={{ left: pendingSelection.xPx, top: pendingSelection.yPx }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {(['green', 'blue', 'red', 'yellow'] as HighlightColor[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => commitHighlight(c, false)}
                      title={`Highlight ${HIGHLIGHT_COLORS[c].label}`}
                      className="w-6 h-6 rounded-full border border-white/40 hover:scale-110 transition-transform"
                      style={{ backgroundColor: HIGHLIGHT_COLORS[c].swatch }}
                    />
                  ))}
                  <div className="w-px h-4 bg-slate-700 mx-0.5" />
                  <button
                    type="button"
                    onClick={() => commitHighlight(activeColor, true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-amber-300 hover:text-amber-200 px-1.5 py-0.5 whitespace-nowrap"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" />
                    Explain
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bookish Margin Notes & Line Explanations Sidebar */}
        {sidebarOpen && (
          <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 bg-[#131824] flex flex-col max-h-[42vh] lg:max-h-none shrink-0">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0C1018]">
                <button
                  type="button"
                  onClick={() => setSidebarFilter('page')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sidebarFilter === 'page'
                      ? 'bg-[#D6A456] text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  This Page ({pageAnnotations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSidebarFilter('all')}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    sidebarFilter === 'all'
                      ? 'bg-[#D6A456] text-slate-950'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Notes ({bookAnnotations.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => setNewPageNoteOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-100 hover:bg-slate-700 whitespace-nowrap"
              >
                <MessageSquarePlus className="w-3.5 h-3.5 text-amber-400" />
                Add Note
              </button>
            </div>

            {newPageNoteOpen && (
              <form
                onSubmit={handleAddStandaloneNote}
                className="p-3.5 border-b border-slate-800 bg-[#0F1420] space-y-2"
              >
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Important Margin Note · Page {pageNum}</span>
                  <div className="flex items-center gap-1">
                    {(['green', 'blue', 'red', 'yellow'] as HighlightColor[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setActiveColor(c)}
                        className={`w-4 h-4 rounded-full ${
                          activeColor === c ? 'ring-2 ring-white' : 'opacity-65'
                        }`}
                        style={{ backgroundColor: HIGHLIGHT_COLORS[c].swatch }}
                      />
                    ))}
                  </div>
                </div>
                <input
                  value={newPageNoteQuote}
                  onChange={(e) => setNewPageNoteQuote(e.target.value)}
                  placeholder="Line / Heading / Quote (optional)"
                  className="w-full rounded-lg border border-slate-700 bg-[#151B28] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <textarea
                  rows={3}
                  value={newPageNoteText}
                  onChange={(e) => setNewPageNoteText(e.target.value)}
                  placeholder="Write your explanation, summary, or important note…"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-[#151B28] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setNewPageNoteOpen(false)}
                    className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-[#D6A456] text-slate-950 px-3 py-1 text-xs font-semibold"
                  >
                    Save Note
                  </button>
                </div>
              </form>
            )}

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {sidebarList.length === 0 ? (
                <div className="text-center py-10 px-4 space-y-2 text-slate-400">
                  <p className="text-xs font-medium text-slate-300">
                    No marks on {sidebarFilter === 'page' ? `page ${pageNum}` : 'this book'} yet
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Select any line on the page to highlight it in Green, Blue, Red, or Yellow, use Margin Pen to underline, or click “Add Note” to write an explanation.
                  </p>
                </div>
              ) : (
                sidebarList.map((ann) => {
                  const swatch = HIGHLIGHT_COLORS[ann.color].swatch;
                  const isEditing = editingNoteId === ann.id;
                  return (
                    <div
                      key={ann.id}
                      className="rounded-xl border border-slate-800 bg-[#171D2B] p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                        <button
                          type="button"
                          onClick={() => goToPage(ann.page)}
                          className="inline-flex items-center gap-1.5 font-mono-num hover:text-amber-300"
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: swatch }}
                          />
                          Page {ann.page} · {ann.kind}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteAnnotation(ann.id)}
                          className="text-slate-500 hover:text-red-400 p-0.5"
                          aria-label="Delete mark"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {ann.quote && (
                        <blockquote className="text-xs italic text-slate-200 leading-relaxed border-b border-slate-800/80 pb-2">
                          “{ann.quote}”
                        </blockquote>
                      )}

                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            rows={3}
                            autoFocus
                            value={explanationDraft}
                            onChange={(e) => setExplanationDraft(e.target.value)}
                            placeholder="Write explanation or personal thoughts on this line…"
                            className="w-full rounded-lg border border-slate-700 bg-[#0D111A] px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400"
                          />
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingNoteId(null)}
                              className="text-xs text-slate-400 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveExplanation(ann)}
                              className="rounded-md bg-[#D6A456] text-slate-950 px-2.5 py-1 text-xs font-semibold"
                            >
                              Save Explanation
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          {ann.explanation ? (
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                              {ann.explanation}
                            </p>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic">
                              No explanation written yet.
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteId(ann.id);
                              setExplanationDraft(ann.explanation || '');
                            }}
                            className="text-[11px] font-medium text-amber-400 hover:text-amber-300"
                          >
                            {ann.explanation ? 'Edit explanation' : '+ Write explanation'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
