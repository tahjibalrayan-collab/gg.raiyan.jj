import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MediaPhoto } from '../types';
import {
  createPhotoThumbnail,
  formatBytes,
  nid,
  sanitizeMediaPhoto,
} from '../lib/archiveUtils';
import {
  getStorageEstimate,
  idbGetPhotoBlob,
  idbGetPhotoThumb,
  idbPutPhotosBatch,
  requestPersistentStorage,
} from '../lib/idb';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderUp,
  HardDrive,
  Heart,
  Image as ImageIcon,
  Link as LinkIcon,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';

interface PhotoVaultViewProps {
  photos: MediaPhoto[];
  onPhotosAdded: (newPhotos: MediaPhoto[]) => void;
  onToggleFavorite: (photo: MediaPhoto) => void;
  onDeletePhoto: (photo: MediaPhoto) => void;
  onToast: (msg: string) => void;
}

const PhotoThumbCard: React.FC<{
  photo: MediaPhoto;
  onOpen: () => void;
  onToggleFav: () => void;
}> = ({ photo, onOpen, onToggleFav }) => {
  const [src, setSrc] = useState<string>(photo.source === 'url' ? photo.url : '');

  useEffect(() => {
    if (photo.source === 'url') {
      setSrc(photo.url);
      return;
    }
    let activeUrl = '';
    let cancelled = false;
    void idbGetPhotoThumb(photo.id).then(async (thumb) => {
      const blob = thumb || (await idbGetPhotoBlob(photo.id));
      if (!blob || cancelled) return;
      activeUrl = URL.createObjectURL(blob);
      setSrc(activeUrl);
    });
    return () => {
      cancelled = true;
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [photo.id, photo.source, photo.url]);

  return (
    <div className="group relative aspect-square rounded-xl overflow-hidden border border-stone-300/70 dark:border-slate-800 bg-stone-200/70 dark:bg-[#171C27]">
      {src ? (
        <img
          src={src}
          alt={photo.title}
          loading="lazy"
          referrerPolicy="no-referrer"
          onClick={onOpen}
          className="w-full h-full object-cover cursor-pointer group-hover:scale-105 transition-transform duration-200"
        />
      ) : (
        <div
          onClick={onOpen}
          className="w-full h-full flex items-center justify-center text-stone-400 cursor-pointer"
        >
          <ImageIcon className="w-6 h-6" />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/75 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between gap-2">
        <span className="text-[11px] text-white truncate">{photo.title}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFav();
          }}
          className="p-1 rounded bg-black/40 text-white hover:text-rose-400"
          aria-label="Favorite photo"
        >
          <Heart
            className={`w-3.5 h-3.5 ${photo.favorite ? 'fill-rose-500 text-rose-500' : ''}`}
          />
        </button>
      </div>
    </div>
  );
};

export const PhotoVaultView: React.FC<PhotoVaultViewProps> = ({
  photos,
  onPhotosAdded,
  onToggleFavorite,
  onDeletePhoto,
  onToast,
}) => {
  const [query, setQuery] = useState('');
  const [albumFilter, setAlbumFilter] = useState('All');
  const [favOnly, setFavOnly] = useState(false);
  const [density, setDensity] = useState<'compact' | 'gallery'>('compact');
  const [limit, setLimit] = useState(60);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(
    null
  );

  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlTitle, setUrlTitle] = useState('');
  const [urlAlbum, setUrlAlbum] = useState('Cloud Album');
  const [urlLink, setUrlLink] = useState('');

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [lightboxFullUrl, setLightboxFullUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getStorageEstimate().then(setStorageInfo);
  }, [photos.length]);

  const albums = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const p of photos) {
      if (p.album) set.add(p.album);
    }
    return Array.from(set);
  }, [photos]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return photos
      .filter(
        (p) =>
          (albumFilter === 'All' || p.album === albumFilter) &&
          (!favOnly || p.favorite) &&
          (!q || [p.title, p.album].join(' ').toLowerCase().includes(q))
      )
      .sort((a, b) => b.ts - a.ts);
  }, [photos, albumFilter, favOnly, query]);

  const visiblePhotos = filtered.slice(0, limit);
  const lightboxPhoto = lightboxIdx !== null ? filtered[lightboxIdx] || null : null;

  // Load full-resolution image for Lightbox
  useEffect(() => {
    if (!lightboxPhoto) {
      setLightboxFullUrl('');
      return;
    }
    if (lightboxPhoto.source === 'url') {
      setLightboxFullUrl(lightboxPhoto.url);
      return;
    }
    let objUrl = '';
    let cancelled = false;
    void idbGetPhotoBlob(lightboxPhoto.id).then((blob) => {
      if (!blob || cancelled) return;
      objUrl = URL.createObjectURL(blob);
      setLightboxFullUrl(objUrl);
    });
    return () => {
      cancelled = true;
      if (objUrl) URL.revokeObjectURL(objUrl);
    };
  }, [lightboxPhoto]);

  // Keyboard navigation in Lightbox
  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIdx(null);
      if (e.key === 'ArrowRight') {
        setLightboxIdx((i) =>
          i !== null && i < filtered.length - 1 ? i + 1 : i
        );
      }
      if (e.key === 'ArrowLeft') {
        setLightboxIdx((i) => (i !== null && i > 0 ? i - 1 : i));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, filtered.length]);

  const importFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    await requestPersistentStorage();

    const imageFiles = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith('image/') ||
        /\.(jpg|jpeg|png|webp|gif|bmp|avif|heic)$/i.test(f.name)
    );
    if (imageFiles.length === 0) {
      onToast('No supported image files selected');
      return;
    }

    setImporting({ done: 0, total: imageFiles.length });
    const added: MediaPhoto[] = [];
    const batchSize = 8;

    for (let i = 0; i < imageFiles.length; i += batchSize) {
      const slice = imageFiles.slice(i, i + batchSize);
      const processed = await Promise.all(
        slice.map(async (file, offset) => {
          const rel =
            (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
          const albumFromPath = rel.includes('/') ? rel.split('/')[0] : 'Camera Roll';
          const thumb = await createPhotoThumbnail(file, 320);
          const meta = sanitizeMediaPhoto({
            id: nid(),
            title: file.name.replace(/\.[^/.]+$/, ''),
            album: albumFromPath,
            source: 'local',
            url: '',
            favorite: false,
            size: file.size,
            ts: Date.now() + i + offset,
          });
          added.push(meta);
          return { meta, blob: file, thumb };
        })
      );

      await idbPutPhotosBatch(processed);
      setImporting({
        done: Math.min(imageFiles.length, i + slice.length),
        total: imageFiles.length,
      });
    }

    setImporting(null);
    onPhotosAdded(added);
    void getStorageEstimate().then(setStorageInfo);
    onToast(`Added ${added.length} photos to your Photo Vault`);
  };

  const handleAddUrlPhoto = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlLink.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      onToast('Enter a valid http:// or https:// image URL');
      return;
    }
    const photo = sanitizeMediaPhoto({
      id: nid(),
      title: urlTitle.trim() || 'Cloud Photo',
      album: urlAlbum.trim() || 'Cloud Album',
      source: 'url',
      url: trimmed,
      favorite: false,
      ts: Date.now(),
    });
    onPhotosAdded([photo]);
    setUrlTitle('');
    setUrlLink('');
    setShowUrlModal(false);
    onToast('Cloud photo link added');
  };

  const handleDownloadOriginal = async (photo: MediaPhoto) => {
    if (photo.source === 'url') {
      const a = document.createElement('a');
      a.href = photo.url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      return;
    }
    const blob = await idbGetPhotoBlob(photo.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${photo.title}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Storage Header & Actions */}
      <div className="rounded-2xl border border-stone-300/70 dark:border-slate-800 bg-white/65 dark:bg-[#141923]/90 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-num text-stone-600 dark:text-slate-400">
              <HardDrive className="w-3.5 h-3.5" />
              <span>
                {photos.length.toLocaleString()} photos archived ·{' '}
                {albums.length - 1} albums
                {storageInfo
                  ? ` · ${formatBytes(storageInfo.usage)} used of ${formatBytes(
                      storageInfo.quota
                    )}`
                  : ''}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-1">
              Engineered for 1,000–200,000+ photos with automatic thumbnail indexing and windowed scrolling.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-4 py-2 text-xs font-semibold hover:opacity-95 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Photos
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#1A202E] px-3.5 py-2 text-xs font-medium hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <FolderUp className="w-3.5 h-3.5" />
              Upload Folder
            </button>
            <button
              type="button"
              onClick={() => setShowUrlModal((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#1A202E] px-3.5 py-2 text-xs font-medium hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <LinkIcon className="w-3.5 h-3.5" />
              Add Photo URL
            </button>
          </div>
        </div>

        {importing && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs font-mono-num text-blue-700 dark:text-blue-300">
            Generating thumbnails & archiving photos: {importing.done} / {importing.total}…
          </div>
        )}

        {showUrlModal && (
          <form
            onSubmit={handleAddUrlPhoto}
            className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-stone-200 dark:border-slate-800"
          >
            <input
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Photo title"
              required
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
            />
            <input
              value={urlAlbum}
              onChange={(e) => setUrlAlbum(e.target.value)}
              placeholder="Album name"
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <input
                value={urlLink}
                onChange={(e) => setUrlLink(e.target.value)}
                placeholder="https://.../photo.jpg"
                required
                className="flex-1 min-w-0 rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
              />
              <button
                type="submit"
                className="rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-3 py-2 text-xs font-semibold whitespace-nowrap"
              >
                Save
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(60);
                }}
                placeholder="Search photos or albums…"
                className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#0D1119] pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#26428B] dark:focus:ring-[#D6A456]"
              />
            </div>

            <button
              type="button"
              onClick={() => setFavOnly((f) => !f)}
              className={`inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium border whitespace-nowrap ${
                favOnly
                  ? 'bg-rose-600 text-white border-transparent'
                  : 'bg-white/70 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 border-stone-300 dark:border-slate-700'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${favOnly ? 'fill-white' : ''}`} />
              Favorites
            </button>

            <button
              type="button"
              onClick={() =>
                setDensity((d) => (d === 'compact' ? 'gallery' : 'compact'))
              }
              className="px-3 py-2 rounded-lg text-xs font-medium border border-stone-300 dark:border-slate-700 bg-white/70 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 whitespace-nowrap"
            >
              {density === 'compact' ? 'Compact Grid' : 'Large Gallery'}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {albums.slice(0, 12).map((alb) => (
              <button
                key={alb}
                type="button"
                onClick={() => {
                  setAlbumFilter(alb);
                  setLimit(60);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  albumFilter === alb
                    ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent'
                    : 'bg-white/60 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/70'
                }`}
              >
                {alb}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Photo Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-800 p-14 text-center space-y-2">
          <ImageIcon className="w-8 h-8 mx-auto text-stone-400 dark:text-slate-500" />
          <p className="text-sm font-medium text-stone-700 dark:text-slate-300">
            Your Photo Vault is empty
          </p>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Click “Add Photos” or “Upload Folder” to store thousands of photos with instant thumbnail search.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-3 ${
            density === 'compact'
              ? 'grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8'
              : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5'
          }`}
        >
          {visiblePhotos.map((photo, idx) => (
            <PhotoThumbCard
              key={photo.id}
              photo={photo}
              onOpen={() => setLightboxIdx(idx)}
              onToggleFav={() => onToggleFavorite(photo)}
            />
          ))}
        </div>
      )}

      {filtered.length > limit && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + 60)}
            className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#171C27] px-5 py-2.5 text-xs font-medium hover:bg-white dark:hover:bg-[#1E2534]"
          >
            Load more ({filtered.length - limit} remaining)
          </button>
        </div>
      )}

      {/* Fullscreen Lightbox */}
      {lightboxPhoto && lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex flex-col justify-between p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div
            className="flex items-center justify-between text-white gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{lightboxPhoto.title}</p>
              <p className="text-xs text-slate-400 font-mono-num">
                {lightboxPhoto.album} · {lightboxIdx + 1} / {filtered.length}
                {lightboxPhoto.size ? ` · ${formatBytes(lightboxPhoto.size)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onToggleFavorite(lightboxPhoto)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Favorite"
              >
                <Heart
                  className={`w-4 h-4 ${
                    lightboxPhoto.favorite ? 'fill-rose-500 text-rose-500' : ''
                  }`}
                />
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadOriginal(lightboxPhoto)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Download photo"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeletePhoto(lightboxPhoto);
                  setLightboxIdx(null);
                }}
                className="p-2 rounded-lg bg-white/10 hover:bg-red-600/80 text-white"
                aria-label="Delete photo"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxIdx(null)}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Close lightbox"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div
            className="flex-1 min-h-0 flex items-center justify-between gap-4 my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLightboxIdx((i) => (i && i > 0 ? i - 1 : i))}
              disabled={lightboxIdx <= 0}
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-20"
              aria-label="Previous photo"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <div className="flex-1 h-full flex items-center justify-center min-w-0">
              {lightboxFullUrl ? (
                <img
                  src={lightboxFullUrl}
                  alt={lightboxPhoto.title}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <div className="text-slate-400 text-xs">Loading full resolution…</div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setLightboxIdx((i) =>
                  i !== null && i < filtered.length - 1 ? i + 1 : i
                )
              }
              disabled={lightboxIdx >= filtered.length - 1}
              className="p-3 rounded-xl bg-white/10 hover:bg-white/20 text-white disabled:opacity-20"
              aria-label="Next photo"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/Safari/Firefox for folder uploads
        webkitdirectory=""
        className="hidden"
        onChange={(e) => {
          void importFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
};
