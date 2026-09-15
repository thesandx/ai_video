/**
 * Binary asset storage for a run, in the browser.
 *
 * Sheets, stills and clips are megabytes each and there is nowhere on the
 * server to put them: Cloud Run runs this app on a read-only filesystem with no
 * bucket attached. IndexedDB holds the bytes, localStorage holds the small
 * project JSON that points at them, and the route handlers stay stateless.
 *
 * Every call is guarded. Private windows, blocked site data and quota limits
 * all make IndexedDB throw or return nothing, and a run that cannot save its
 * assets should say so rather than lose them silently.
 */

const DB_NAME = 'reel-director';
const DB_VERSION = 1;
const STORE = 'assets';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser has no IndexedDB, so assets cannot be saved.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
  });
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = run(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Local storage failed.'));
      }),
  );
}

export async function putAsset(key: string, blob: Blob): Promise<void> {
  await tx('readwrite', (store) => store.put(blob, key) as IDBRequest<IDBValidKey>);
}

export async function getAsset(key: string): Promise<Blob | null> {
  const value = await tx<unknown>('readonly', (store) => store.get(key) as IDBRequest<unknown>);
  return value instanceof Blob ? value : null;
}

export async function deleteAsset(key: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
}

/** Reads an asset back as a data URL, which is what the generation routes take. */
export async function getAssetDataUrl(key: string): Promise<string | null> {
  const blob = await getAsset(key);
  if (blob === null) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that asset.'));
    reader.readAsDataURL(blob);
  });
}

/** Turns a data URL from an API reply into a Blob for storage. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header = '', encoded = ''] = dataUrl.split(',', 2);
  const mime = header.slice(5).split(';', 1)[0] ?? 'application/octet-stream';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Reads the pixel dimensions of an image blob, so preflight can check its shape. */
export function imageSize(blob: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}
