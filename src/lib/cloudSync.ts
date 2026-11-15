import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  Book,
  BookAnnotation,
  DiaryPage,
  LibraryMeta,
  MediaPhoto,
  MediaTrack,
} from '../types';
import {
  sanitizeAnnotation,
  sanitizeBook,
  sanitizeDiaryPage,
  sanitizeMediaPhoto,
  sanitizeMediaTrack,
  sanitizeMeta,
} from './archiveUtils';

export interface CloudListenersCallbacks {
  onBooks: (books: Record<string, Book>, cloudIds: Set<string>) => void;
  onMeta: (meta: LibraryMeta | null, exists: boolean) => void;
  onDiary: (pages: DiaryPage[], cloudIds: Set<string>) => void;
  onAnnotations: (annotations: BookAnnotation[], cloudIds: Set<string>) => void;
  onTracks: (tracks: MediaTrack[]) => void;
  onPhotos: (photos: MediaPhoto[]) => void;
  onError: (err: Error) => void;
}

export function subscribeUserArchive(
  uid: string,
  callbacks: CloudListenersCallbacks
): Unsubscribe {
  const booksPath = `users/${uid}/books`;
  const diaryPath = `users/${uid}/diary`;
  const metaPath = `users/${uid}/meta/library`;
  const annPath = `users/${uid}/annotations`;
  const tracksPath = `users/${uid}/tracks`;
  const photosPath = `users/${uid}/photos`;

  const unsubBooks = onSnapshot(
    query(collection(db, booksPath), where('ownerId', '==', uid)),
    (snap) => {
      const nextBooks: Record<string, Book> = {};
      const ids = new Set<string>();
      snap.forEach((d) => {
        const clean = sanitizeBook(d.data() as Partial<Book>, d.id);
        nextBooks[clean.id] = clean;
        ids.add(clean.id);
      });
      callbacks.onBooks(nextBooks, ids);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, booksPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  const unsubMeta = onSnapshot(
    doc(db, metaPath),
    (snap) => {
      if (!snap.exists()) {
        callbacks.onMeta(null, false);
        return;
      }
      callbacks.onMeta(sanitizeMeta(snap.data() as Partial<LibraryMeta>), true);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, metaPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  const unsubDiary = onSnapshot(
    query(collection(db, diaryPath), where('ownerId', '==', uid)),
    (snap) => {
      const pages: DiaryPage[] = [];
      const ids = new Set<string>();
      snap.forEach((d) => {
        const clean = sanitizeDiaryPage(d.data() as Partial<DiaryPage>, d.id);
        pages.push(clean);
        ids.add(clean.id);
      });
      callbacks.onDiary(pages, ids);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, diaryPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  const unsubAnnotations = onSnapshot(
    query(collection(db, annPath), where('ownerId', '==', uid)),
    (snap) => {
      const items: BookAnnotation[] = [];
      const ids = new Set<string>();
      snap.forEach((d) => {
        const clean = sanitizeAnnotation(d.data() as Partial<BookAnnotation>, d.id);
        items.push(clean);
        ids.add(clean.id);
      });
      callbacks.onAnnotations(items, ids);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, annPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  const unsubTracks = onSnapshot(
    query(collection(db, tracksPath), where('ownerId', '==', uid)),
    (snap) => {
      const tracks: MediaTrack[] = [];
      snap.forEach((d) => {
        const clean = sanitizeMediaTrack(
          { ...(d.data() as Partial<MediaTrack>), source: 'url' },
          d.id
        );
        tracks.push(clean);
      });
      callbacks.onTracks(tracks);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, tracksPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  const unsubPhotos = onSnapshot(
    query(collection(db, photosPath), where('ownerId', '==', uid)),
    (snap) => {
      const photos: MediaPhoto[] = [];
      snap.forEach((d) => {
        const clean = sanitizeMediaPhoto(
          { ...(d.data() as Partial<MediaPhoto>), source: 'url' },
          d.id
        );
        photos.push(clean);
      });
      callbacks.onPhotos(photos);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, photosPath);
      } catch (e) {
        callbacks.onError(e as Error);
      }
    }
  );

  return () => {
    unsubBooks();
    unsubMeta();
    unsubDiary();
    unsubAnnotations();
    unsubTracks();
    unsubPhotos();
  };
}

export async function saveBookToCloud(uid: string, book: Book): Promise<void> {
  const clean = sanitizeBook(book);
  const path = `users/${uid}/books/${clean.id}`;
  const ref = doc(db, path);
  const payload = {
    t: clean.t,
    a: clean.a,
    g: clean.g,
    tp: clean.tp,
    y: clean.y,
    status: clean.status,
    rt: clean.rt,
    pt: clean.pt,
    pg: clean.pg,
    nt: clean.nt,
    img: clean.img || '',
    pdf: clean.pdf === 'local' ? '' : clean.pdf || '',
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        id: clean.id,
        ownerId: uid,
        ...payload,
        ts: clean.ts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateBookStatusInCloud(uid: string, book: Book): Promise<void> {
  const clean = sanitizeBook(book);
  const path = `users/${uid}/books/${clean.id}`;
  const ref = doc(db, path);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { status: clean.status, updatedAt: serverTimestamp() });
    } else {
      await saveBookToCloud(uid, clean);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateBookProgressInCloud(uid: string, book: Book): Promise<void> {
  const clean = sanitizeBook(book);
  const path = `users/${uid}/books/${clean.id}`;
  const ref = doc(db, path);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { pg: clean.pg, updatedAt: serverTimestamp() });
    } else {
      await saveBookToCloud(uid, clean);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteBookFromCloud(uid: string, bookId: string): Promise<void> {
  const path = `users/${uid}/books/${bookId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveMetaToCloud(uid: string, meta: LibraryMeta): Promise<void> {
  const clean = sanitizeMeta(meta);
  const path = `users/${uid}/meta/library`;
  const ref = doc(db, path);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { gx: clean.gx, tp: clean.tp, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        ownerId: uid,
        gx: clean.gx,
        tp: clean.tp,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function saveDiaryPageToCloud(uid: string, page: DiaryPage): Promise<void> {
  const clean = sanitizeDiaryPage(page);
  const path = `users/${uid}/diary/${clean.id}`;
  const ref = doc(db, path);
  const payload = {
    date: clean.date,
    time: clean.time,
    mood: clean.mood,
    title: clean.title,
    text: clean.text,
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        id: clean.id,
        ownerId: uid,
        ...payload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteDiaryPageFromCloud(uid: string, pageId: string): Promise<void> {
  const path = `users/${uid}/diary/${pageId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveAnnotationToCloud(
  uid: string,
  ann: BookAnnotation
): Promise<void> {
  const clean = sanitizeAnnotation(ann);
  const path = `users/${uid}/annotations/${clean.id}`;
  const ref = doc(db, path);
  const payload = {
    color: clean.color,
    quote: clean.quote || '',
    explanation: clean.explanation || '',
    rects: clean.rects || [],
    points: clean.points || [],
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        id: clean.id,
        ownerId: uid,
        bookId: clean.bookId,
        page: clean.page,
        kind: clean.kind,
        ...payload,
        ts: clean.ts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteAnnotationFromCloud(uid: string, annId: string): Promise<void> {
  const path = `users/${uid}/annotations/${annId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveTrackToCloud(uid: string, track: MediaTrack): Promise<void> {
  if (track.source !== 'url' || !track.url) return;
  const clean = sanitizeMediaTrack(track);
  const path = `users/${uid}/tracks/${clean.id}`;
  const ref = doc(db, path);
  const payload = {
    title: clean.title,
    artist: clean.artist,
    album: clean.album,
    folder: clean.folder,
    url: clean.url,
    duration: clean.duration,
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        id: clean.id,
        ownerId: uid,
        ...payload,
        ts: clean.ts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTrackFromCloud(uid: string, trackId: string): Promise<void> {
  const path = `users/${uid}/tracks/${trackId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function savePhotoToCloud(uid: string, photo: MediaPhoto): Promise<void> {
  if (photo.source !== 'url' || !photo.url) return;
  const clean = sanitizeMediaPhoto(photo);
  const path = `users/${uid}/photos/${clean.id}`;
  const ref = doc(db, path);
  const payload = {
    title: clean.title,
    album: clean.album,
    url: clean.url,
    favorite: clean.favorite,
  };

  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
    } else {
      await setDoc(ref, {
        id: clean.id,
        ownerId: uid,
        ...payload,
        ts: clean.ts,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deletePhotoFromCloud(uid: string, photoId: string): Promise<void> {
  const path = `users/${uid}/photos/${photoId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
