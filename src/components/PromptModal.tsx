import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  confirmLabel?: string;
  requireInput?: boolean;
  danger?: boolean;
  onClose: () => void;
  onConfirm: (value: string) => void;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  title,
  description,
  placeholder,
  confirmLabel = 'Confirm',
  requireInput = true,
  danger = false,
  onClose,
  onConfirm,
}) => {
  const [val, setVal] = useState('');

  useEffect(() => {
    if (isOpen) setVal('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (requireInput && !val.trim()) return;
    onConfirm(val.trim());
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-stone-200 dark:border-slate-700/80 bg-[#FAF7F0] dark:bg-[#151A25] text-stone-900 dark:text-slate-100 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl font-semibold">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 dark:text-slate-400 dark:hover:text-white"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {description && (
          <p className="text-xs text-stone-600 dark:text-slate-400 mb-4 leading-relaxed">
            {description}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {requireInput && (
            <input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={placeholder}
              className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0E121B] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 dark:focus:ring-amber-400"
            />
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 dark:border-slate-700 px-4 py-2 text-xs font-medium hover:bg-stone-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`rounded-lg px-4 py-2 text-xs font-semibold transition-opacity hover:opacity-95 ${
                danger
                  ? 'bg-red-600 text-white'
                  : 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
