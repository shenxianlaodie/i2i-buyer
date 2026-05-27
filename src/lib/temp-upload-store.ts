type TempUploadEntry = {
  buffer: Buffer;
  mime: string;
  userId: string;
  createdAt: number;
};

const store = new Map<string, TempUploadEntry>();
const TTL_MS = 24 * 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [id, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(id);
  }
}

export function putTempUpload(
  userId: string,
  buffer: Buffer,
  mime: string,
): string {
  const id = crypto.randomUUID();
  store.set(id, { buffer, mime, userId, createdAt: Date.now() });
  prune();
  return id;
}

export function getTempUpload(
  id: string,
  userId: string,
): TempUploadEntry | null {
  const entry = store.get(id);
  if (!entry || entry.userId !== userId) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return entry;
}

export function getTempUploadData(
  id: string,
): { buffer: Buffer; mime: string } | null {
  const entry = store.get(id);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(id);
    return null;
  }
  return { buffer: entry.buffer, mime: entry.mime };
}
