import { MediaPhoto, MediaTrack } from '../types';

const DB_NAME = 'libpdf';
const DB_VERSION = 2;
const STORE_FILES = 'f';
const STORE_AUDIO_META = 'audioMeta';
const STORE_AUDIO_BLOBS = 'audioBlobs';
const STORE_PHOTO_META = 'photoMeta';
const STORE_PHOTO_THUMBS = 'photoThumbs';
const STORE_PHOTO_BLOBS = 'photoBlobs';

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES);
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO_META)) {
        db.createObjectStore(STORE_AUDIO_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_AUDIO_BLOBS)) {
        db.createObjectStore(STORE_AUDIO_BLOBS);
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_META)) {
        db.createObjectStore(STORE_PHOTO_META, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_THUMBS)) {
        db.createObjectStore(STORE_PHOTO_THUMBS);
      }
      if (!db.objectStoreNames.contains(STORE_PHOTO_BLOBS)) {
        db.createObjectStore(STORE_PHOTO_BLOBS);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch {
    // ignore
  }
  return false;
}

export async function getStorageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const est = await navigator.storage.estimate();
      return {
        usage: est.usage || 0,
        quota: est.quota || 0,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

export async function idbPut(key: string, value: Blob | string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet<T = Blob | string>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE_FILES, 'readonly').objectStore(STORE_FILES).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(key: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FILES, 'readwrite');
    tx.objectStore(STORE_FILES).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbLoadImages(): Promise<Record<string, string>> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_FILES, 'readonly').objectStore(STORE_FILES);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    keysReq.onerror = () => reject(keysReq.error);
    valsReq.onerror = () => reject(valsReq.error);
    valsReq.onsuccess = () => {
      const result: Record<string, string> = {};
      const keys = keysReq.result || [];
      const vals = valsReq.result || [];
      keys.forEach((k, idx) => {
        if (typeof k === 'string' && k.startsWith('img:') && typeof vals[idx] === 'string') {
          result[k.slice(4)] = vals[idx] as string;
        }
      });
      resolve(result);
    };
  });
}

// High-capacity Music Vault IndexedDB helpers
export async function idbPutTracksBatch(
  items: { meta: MediaTrack; blob?: Blob }[]
): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_AUDIO_META, STORE_AUDIO_BLOBS], 'readwrite');
    const metaStore = tx.objectStore(STORE_AUDIO_META);
    const blobStore = tx.objectStore(STORE_AUDIO_BLOBS);
    for (const item of items) {
      metaStore.put(item.meta);
      if (item.blob) {
        blobStore.put(item.blob, item.meta.id);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllTracksMeta(): Promise<MediaTrack[]> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_AUDIO_META, 'readonly')
      .objectStore(STORE_AUDIO_META)
      .getAll();
    req.onsuccess = () => resolve((req.result as MediaTrack[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetTrackBlob(id: string): Promise<Blob | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_AUDIO_BLOBS, 'readonly')
      .objectStore(STORE_AUDIO_BLOBS)
      .get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeleteTrack(id: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_AUDIO_META, STORE_AUDIO_BLOBS], 'readwrite');
    tx.objectStore(STORE_AUDIO_META).delete(id);
    tx.objectStore(STORE_AUDIO_BLOBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// High-capacity Photo Vault IndexedDB helpers
export async function idbPutPhotosBatch(
  items: { meta: MediaPhoto; blob?: Blob; thumb?: Blob }[]
): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_PHOTO_META, STORE_PHOTO_BLOBS, STORE_PHOTO_THUMBS],
      'readwrite'
    );
    const metaStore = tx.objectStore(STORE_PHOTO_META);
    const blobStore = tx.objectStore(STORE_PHOTO_BLOBS);
    const thumbStore = tx.objectStore(STORE_PHOTO_THUMBS);
    for (const item of items) {
      metaStore.put(item.meta);
      if (item.blob) blobStore.put(item.blob, item.meta.id);
      if (item.thumb) thumbStore.put(item.thumb, item.meta.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGetAllPhotosMeta(): Promise<MediaPhoto[]> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_PHOTO_META, 'readonly')
      .objectStore(STORE_PHOTO_META)
      .getAll();
    req.onsuccess = () => resolve((req.result as MediaPhoto[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetPhotoThumb(id: string): Promise<Blob | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_PHOTO_THUMBS, 'readonly')
      .objectStore(STORE_PHOTO_THUMBS)
      .get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGetPhotoBlob(id: string): Promise<Blob | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db
      .transaction(STORE_PHOTO_BLOBS, 'readonly')
      .objectStore(STORE_PHOTO_BLOBS)
      .get(id);
    req.onsuccess = () => resolve(req.result as Blob | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDeletePhoto(id: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORE_PHOTO_META, STORE_PHOTO_BLOBS, STORE_PHOTO_THUMBS],
      'readwrite'
    );
    tx.objectStore(STORE_PHOTO_META).delete(id);
    tx.objectStore(STORE_PHOTO_BLOBS).delete(id);
    tx.objectStore(STORE_PHOTO_THUMBS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
