import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MediaTrack } from '../types';
import {
  formatBytes,
  formatDuration,
  nid,
  sanitizeMediaTrack,
} from '../lib/archiveUtils';
import {
  getStorageEstimate,
  idbPutTracksBatch,
  requestPersistentStorage,
} from '../lib/idb';
import {
  FolderUp,
  HardDrive,
  Link as LinkIcon,
  Music,
  Pause,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
} from 'lucide-react';

interface MusicVaultViewProps {
  tracks: MediaTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  onTracksAdded: (newTracks: MediaTrack[]) => void;
  onPlayTrack: (track: MediaTrack, queue: MediaTrack[]) => void;
  onTogglePlay: () => void;
  onDeleteTrack: (track: MediaTrack) => void;
  onToast: (msg: string) => void;
}

export const MusicVaultView: React.FC<MusicVaultViewProps> = ({
  tracks,
  currentTrackId,
  isPlaying,
  onTracksAdded,
  onPlayTrack,
  onTogglePlay,
  onDeleteTrack,
  onToast,
}) => {
  const [query, setQuery] = useState('');
  const [folderFilter, setFolderFilter] = useState('All');
  const [limit, setLimit] = useState(60);
  const [importing, setImporting] = useState<{ done: number; total: number } | null>(null);
  const [storageInfo, setStorageInfo] = useState<{ usage: number; quota: number } | null>(
    null
  );
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlTitle, setUrlTitle] = useState('');
  const [urlArtist, setUrlArtist] = useState('');
  const [urlFolder, setUrlFolder] = useState('Cloud Playlist');
  const [urlLink, setUrlLink] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getStorageEstimate().then(setStorageInfo);
  }, [tracks.length]);

  const folders = useMemo(() => {
    const set = new Set<string>(['All']);
    for (const t of tracks) {
      if (t.folder) set.add(t.folder);
    }
    return Array.from(set);
  }, [tracks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tracks
      .filter(
        (t) =>
          (folderFilter === 'All' || t.folder === folderFilter) &&
          (!q ||
            [t.title, t.artist, t.album, t.folder].join(' ').toLowerCase().includes(q))
      )
      .sort((a, b) => b.ts - a.ts);
  }, [tracks, folderFilter, query]);

  const visibleTracks = filtered.slice(0, limit);

  const importFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    await requestPersistentStorage();

    const audioFiles = Array.from(fileList).filter(
      (f) =>
        f.type.startsWith('audio/') ||
        /\.(mp3|m4a|wav|ogg|flac|aac|opus|webm)$/i.test(f.name)
    );
    if (audioFiles.length === 0) {
      onToast('No supported audio files selected');
      return;
    }

    setImporting({ done: 0, total: audioFiles.length });
    const added: MediaTrack[] = [];
    const batchSize = 40;

    for (let i = 0; i < audioFiles.length; i += batchSize) {
      const slice = audioFiles.slice(i, i + batchSize);
      const batchItems: { meta: MediaTrack; blob: Blob }[] = slice.map((file) => {
        const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || '';
        const folderFromPath = rel.includes('/') ? rel.split('/')[0] : 'Local Music';
        const cleanTitle = file.name.replace(/\.[^/.]+$/, '');
        const meta = sanitizeMediaTrack({
          id: nid(),
          title: cleanTitle,
          artist: '',
          album: '',
          folder: folderFromPath,
          source: 'local',
          url: '',
          duration: 0,
          size: file.size,
          ts: Date.now() + i,
        });
        added.push(meta);
        return { meta, blob: file };
      });

      await idbPutTracksBatch(batchItems);
      setImporting({
        done: Math.min(audioFiles.length, i + slice.length),
        total: audioFiles.length,
      });
    }

    setImporting(null);
    onTracksAdded(added);
    void getStorageEstimate().then(setStorageInfo);
    onToast(`Added ${added.length} songs to your Music Vault`);
  };

  const handleAddUrlTrack = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = urlLink.trim();
    if (!/^https?:\/\//i.test(trimmedUrl)) {
      onToast('Enter a valid http:// or https:// audio URL');
      return;
    }
    const track = sanitizeMediaTrack({
      id: nid(),
      title: urlTitle.trim() || 'Stream Track',
      artist: urlArtist.trim(),
      album: '',
      folder: urlFolder.trim() || 'Cloud Playlist',
      source: 'url',
      url: trimmedUrl,
      duration: 0,
      ts: Date.now(),
    });
    onTracksAdded([track]);
    setUrlTitle('');
    setUrlArtist('');
    setUrlLink('');
    setShowUrlModal(false);
    onToast('Cloud audio link added');
  };

  const handleShufflePlay = () => {
    if (filtered.length === 0) return;
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    onPlayTrack(shuffled[0], shuffled);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-20">
      {/* Music Storage Summary & Search */}
      <div className="rounded-2xl border border-stone-300/70 dark:border-slate-800 bg-white/65 dark:bg-[#141923]/90 p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-mono-num text-stone-600 dark:text-slate-400">
              <HardDrive className="w-3.5 h-3.5" />
              <span>
                {tracks.length.toLocaleString()} songs stored ·{' '}
                {folders.length - 1} playlists
                {storageInfo
                  ? ` · ${formatBytes(storageInfo.usage)} used of ${formatBytes(
                      storageInfo.quota
                    )}`
                  : ''}
              </span>
            </div>
            <p className="text-xs text-stone-500 dark:text-slate-400 mt-1">
              Supports 1,000–4,000+ songs with IndexedDB storage. Upload single files, entire folders, or cloud audio links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 px-4 py-2 text-xs font-semibold hover:opacity-95 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Songs
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
              Add Audio URL
            </button>
            {filtered.length > 0 && (
              <button
                type="button"
                onClick={handleShufflePlay}
                className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#1A202E] px-3.5 py-2 text-xs font-medium hover:bg-white dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Shuffle className="w-3.5 h-3.5" />
                Shuffle All
              </button>
            )}
          </div>
        </div>

        {importing && (
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-xs font-mono-num text-blue-700 dark:text-blue-300">
            Importing songs to archive storage: {importing.done} / {importing.total}…
          </div>
        )}

        {showUrlModal && (
          <form
            onSubmit={handleAddUrlTrack}
            className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 pt-2 border-t border-stone-200 dark:border-slate-800"
          >
            <input
              value={urlTitle}
              onChange={(e) => setUrlTitle(e.target.value)}
              placeholder="Song title"
              required
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
            />
            <input
              value={urlArtist}
              onChange={(e) => setUrlArtist(e.target.value)}
              placeholder="Artist (optional)"
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
            />
            <input
              value={urlFolder}
              onChange={(e) => setUrlFolder(e.target.value)}
              placeholder="Playlist name"
              className="rounded-lg border border-stone-300 dark:border-slate-700 bg-white dark:bg-[#0D1119] px-3 py-2 text-xs"
            />
            <div className="flex gap-2">
              <input
                value={urlLink}
                onChange={(e) => setUrlLink(e.target.value)}
                placeholder="https://.../song.mp3"
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

        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(60);
              }}
              placeholder="Search songs, artists, or playlists…"
              className="w-full rounded-lg border border-stone-300 dark:border-slate-700 bg-white/80 dark:bg-[#0D1119] pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#26428B] dark:focus:ring-[#D6A456]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {folders.slice(0, 14).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFolderFilter(f);
                  setLimit(60);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                  folderFilter === f
                    ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950 border-transparent'
                    : 'bg-white/60 dark:bg-[#171C27] text-stone-700 dark:text-slate-300 border-stone-300/70 dark:border-slate-700/70'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Track List */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 dark:border-slate-800 p-14 text-center space-y-2">
          <Music className="w-8 h-8 mx-auto text-stone-400 dark:text-slate-500" />
          <p className="text-sm font-medium text-stone-700 dark:text-slate-300">
            Your Music Vault is empty
          </p>
          <p className="text-xs text-stone-500 dark:text-slate-400">
            Click “Add Songs” or “Upload Folder” to load hundreds or thousands of songs into your archive.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-stone-300/70 dark:border-slate-800 bg-white/65 dark:bg-[#141923]/90 overflow-hidden">
          <div className="divide-y divide-stone-200/70 dark:divide-slate-800/80">
            {visibleTracks.map((track, idx) => {
              const active = currentTrackId === track.id;
              return (
                <div
                  key={track.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-100/70 dark:hover:bg-[#1A2130] transition-colors ${
                    active ? 'bg-blue-50/70 dark:bg-[#1B2233]' : ''
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        active ? onTogglePlay() : onPlayTrack(track, filtered)
                      }
                      aria-label={active && isPlaying ? 'Pause' : 'Play'}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        active
                          ? 'bg-[#26428B] dark:bg-[#D6A456] text-white dark:text-slate-950'
                          : 'bg-stone-200/80 dark:bg-slate-800 text-stone-700 dark:text-slate-200 hover:bg-stone-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      {active && isPlaying ? (
                        <Pause className="w-4 h-4" />
                      ) : (
                        <Play className="w-4 h-4 ml-0.5" />
                      )}
                    </button>

                    <span className="hidden sm:inline-block w-8 text-xs font-mono-num text-stone-400 dark:text-slate-500 text-right shrink-0">
                      {idx + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() =>
                          active ? onTogglePlay() : onPlayTrack(track, filtered)
                        }
                        className={`text-left text-sm font-medium truncate block w-full ${
                          active
                            ? 'text-[#26428B] dark:text-[#D6A456]'
                            : 'text-stone-900 dark:text-slate-100'
                        }`}
                      >
                        {track.title}
                      </button>
                      <div className="text-[11px] text-stone-500 dark:text-slate-400 truncate">
                        {track.artist || 'Unknown Artist'} · {track.folder}
                        {track.source === 'url' ? ' · Cloud URL' : ''}
                        {track.size ? ` · ${formatBytes(track.size)}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {track.duration > 0 && (
                      <span className="text-xs font-mono-num text-stone-500 dark:text-slate-400">
                        {formatDuration(track.duration)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onDeleteTrack(track)}
                      aria-label="Delete track"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
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

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
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
