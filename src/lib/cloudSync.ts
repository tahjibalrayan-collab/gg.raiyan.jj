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
import { Book, DiaryPage, LibraryMeta } from '../types';
import { sanitizeBook, sanitizeDiaryPage, sanitizeMeta } from './archiveUtils';

export interface CloudListenersCallbacks {
  onBooks: (books: Record<string, Book>, cloudIds: Set<string>) => void;
  onMeta: (meta: LibraryMeta | null, exists: boolean) => void;
  onDiary: (pages: DiaryPage[], cloudIds: Set<string>) => void;
  onError: (err: Error) => void;
}

export function subscribeUserArchive(
  uid: string,
  callbacks: CloudListenersCallbacks
): Unsubscribe {
  const booksPath = `users/${uid}/books`;
  const diaryPath = `users/${uid}/diary`;
  const metaPath = `users/${uid}/meta/library`;

  const unsubBooks = onSnapshot(
    query(collection(db, booksPath), where('ownerId', '==', uid)),
    (snap) => {
      const nextBooks: Record<string, Book> = {};
      const ids = new Set<string>();
      snap.forEach((d) => {
        const raw = d.data() as Partial<Book>;
        const clean = sanitizeBook(raw, d.id);
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
      const clean = sanitizeMeta(snap.data() as Partial<LibraryMeta>);
      callbacks.onMeta(clean, true);
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
        const raw = d.data() as Partial<DiaryPage>;
        const clean = sanitizeDiaryPage(raw, d.id);
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

  return () => {
    unsubBooks();
    unsubMeta();
    unsubDiary();
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
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
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

export async function updateBookStatusInCloud(
  uid: string,
  book: Book
): Promise<void> {
  const clean = sanitizeBook(book);
  const path = `users/${uid}/books/${clean.id}`;
  const ref = doc(db, path);
  try {
    const existingSnap = await getDoc(ref);
    if (existingSnap.exists()) {
      await updateDoc(ref, {
        status: clean.status,
        updatedAt: serverTimestamp(),
      });
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
      await updateDoc(ref, {
        gx: clean.gx,
        tp: clean.tp,
        updatedAt: serverTimestamp(),
      });
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
      await updateDoc(ref, {
        ...payload,
        updatedAt: serverTimestamp(),
      });
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
