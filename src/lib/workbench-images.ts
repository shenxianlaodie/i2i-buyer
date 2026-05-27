export type FusionRowImages = { base?: string; print?: string };
export type PoseRowImages = { source?: string };

function fusionKey(batchId: string) {
  return `wb:fusion:${batchId}`;
}

function poseKey(batchId: string) {
  return `wb:pose:${batchId}`;
}

function read<T>(key: string): Record<string, T> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}") as Record<string, T>;
  } catch {
    return {};
  }
}

function write<T>(key: string, data: Record<string, T>) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(key, JSON.stringify(data));
}

export function getFusionRowImages(batchId: string) {
  return read<FusionRowImages>(fusionKey(batchId));
}

export function setFusionRowImages(
  batchId: string,
  rowId: string,
  patch: FusionRowImages,
) {
  const all = read<FusionRowImages>(fusionKey(batchId));
  all[rowId] = { ...all[rowId], ...patch };
  write(fusionKey(batchId), all);
}

export function getPoseRowImages(batchId: string) {
  return read<PoseRowImages>(poseKey(batchId));
}

export function setPoseRowImages(
  batchId: string,
  rowId: string,
  patch: PoseRowImages,
) {
  const all = read<PoseRowImages>(poseKey(batchId));
  all[rowId] = { ...all[rowId], ...patch };
  write(poseKey(batchId), all);
}
