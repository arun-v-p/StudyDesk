import { MATERIALS_KEY, materialBlobs, MAX_MATERIAL_SIZE_BYTES } from './materials';

export const ARCHIVE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const enc = new TextEncoder();
const dec = new TextDecoder();

export type ArchiveProgress = {
  phase: 'preparing' | 'reading' | 'writing' | 'validating' | 'complete';
  completed: number;
  total: number;
  message: string;
};
export type BlobEntry = { id: string; blob: Blob };
export type ArchiveManifest = {
  format: 'studydesk-archive';
  formatVersion: 1;
  createdAt: string;
  appVersion?: string;
  recordCounts: { collections: number; attachments: number; attachmentBytes: number };
  entries: Array<{ path: string; sha256: string; size: number }>;
  attachments: Array<{ blobId: string; path: string; sha256: string; size: number; type: string }>;
};
const emit = (cb: ((p: ArchiveProgress) => void) | undefined, p: ArchiveProgress) => cb?.(p);
const join = (parts: Uint8Array[]) => {
  const result = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    result.set(p, at);
    at += p.length;
  }
  return result;
};
const u16 = (n: number) => {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n, true);
  return b;
};
const u32 = (n: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
};
function crc32(bytes: Uint8Array) {
  let c = 0xffffffff;
  for (const x of bytes) {
    c ^= x;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}
async function sha(bytes: Uint8Array) {
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', source));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** A standard store-only ZIP: no browser-specific serialization is used. */
function makeZip(entries: Array<{ path: string; bytes: Uint8Array }>) {
  const local: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = enc.encode(entry.path),
      size = entry.bytes.length,
      crc = crc32(entry.bytes);
    const body = join([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      name,
      entry.bytes,
    ]);
    local.push(body);
    central.push(
      join([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(size),
        u32(size),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += body.length;
  }
  const directory = join(central);
  const body = join([
    ...local,
    directory,
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(directory.length),
    u32(offset),
    u16(0),
  ]);
  return new Blob([body.buffer as ArrayBuffer], { type: 'application/zip' });
}
export function readZip(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('The archive is missing its ZIP directory.');
  const result = new Map<string, Uint8Array<ArrayBuffer>>(),
    count = v.getUint16(end + 10, true);
  let at = v.getUint32(end + 16, true);
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || v.getUint32(at, true) !== 0x02014b50)
      throw new Error('The ZIP directory is malformed.');
    const method = v.getUint16(at + 10, true),
      size = v.getUint32(at + 24, true),
      nameLen = v.getUint16(at + 28, true),
      extra = v.getUint16(at + 30, true),
      comment = v.getUint16(at + 32, true),
      local = v.getUint32(at + 42, true),
      path = dec.decode(bytes.slice(at + 46, at + 46 + nameLen));
    if (!path || path.includes('..') || result.has(path))
      throw new Error('The archive contains duplicate or unsafe entry names.');
    if (method !== 0 || local + 30 > bytes.length || v.getUint32(local, true) !== 0x04034b50)
      throw new Error('This ZIP uses unsupported compression or is malformed.');
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    if (dataAt + size > bytes.length) throw new Error(`Archive entry "${path}" is truncated.`);
    const content = bytes.slice(dataAt, dataAt + size) as Uint8Array<ArrayBuffer>;
    if (crc32(content) !== v.getUint32(at + 16, true))
      throw new Error(`Archive entry "${path}" is corrupt.`);
    result.set(path, content);
    at += 46 + nameLen + extra + comment;
  }
  return result;
}
const record = (x: unknown): Record<string, unknown> | null =>
  typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
export function attachmentIds(data: Record<string, unknown>) {
  const m = record(data[MATERIALS_KEY]),
    inner = record(m?.data),
    files = inner?.files;
  if (!Array.isArray(files)) return [];
  const ids = new Set<string>();
  return files.map(record).map((f) => {
    if (!f || typeof f.blobId !== 'string' || !f.blobId || ids.has(f.blobId))
      throw new Error('Material metadata has missing or duplicate attachment IDs.');
    ids.add(f.blobId);
    return f.blobId;
  });
}
export async function createArchive(
  data: Record<string, unknown>,
  appVersion: string | undefined,
  onProgress?: (p: ArchiveProgress) => void,
) {
  emit(onProgress, { phase: 'preparing', completed: 0, total: 0, message: 'Preparing backup…' });
  const ids = attachmentIds(data),
    attachments: ArchiveManifest['attachments'] = [],
    files: Array<{ path: string; bytes: Uint8Array }> = [];
  for (let i = 0; i < ids.length; i += 1) {
    emit(onProgress, {
      phase: 'reading',
      completed: i,
      total: ids.length,
      message: `Reading attachment ${i + 1} of ${ids.length}…`,
    });
    const blob = await materialBlobs.get(ids[i]!);
    if (!blob)
      throw new Error(
        `An attachment is missing from this browser. Restore or remove it before exporting.`,
      );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length > MAX_MATERIAL_SIZE_BYTES)
      throw new Error('An attachment exceeds the 50 MiB Study Materials limit.');
    const path = `attachments/${encodeURIComponent(ids[i]!)}`;
    attachments.push({
      blobId: ids[i]!,
      path,
      sha256: await sha(bytes),
      size: bytes.length,
      type: blob.type || 'application/octet-stream',
    });
    files.push({ path, bytes });
  }
  const dataBytes = enc.encode(JSON.stringify({ app: 'studydesk', data })),
    manifest: ArchiveManifest = {
      format: 'studydesk-archive',
      formatVersion: 1,
      createdAt: new Date().toISOString(),
      appVersion,
      recordCounts: {
        collections: Object.keys(data).length,
        attachments: attachments.length,
        attachmentBytes: attachments.reduce((n, x) => n + x.size, 0),
      },
      entries: [{ path: 'data.json', sha256: await sha(dataBytes), size: dataBytes.length }],
      attachments,
    };
  emit(onProgress, {
    phase: 'complete',
    completed: ids.length,
    total: ids.length,
    message: 'Backup ready.',
  });
  return makeZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest)) },
    { path: 'data.json', bytes: dataBytes },
    ...files,
  ]);
}
export async function parseArchive(
  file: File,
  validateData: (x: unknown) => Record<string, unknown>,
  onProgress?: (p: ArchiveProgress) => void,
) {
  if (file.size > MAX_ARCHIVE_BYTES)
    throw new Error('This archive is over the 512 MiB safety limit.');
  emit(onProgress, { phase: 'validating', completed: 0, total: 0, message: 'Validating archive…' });
  const entries = readZip(new Uint8Array(await file.arrayBuffer())),
    manifestBytes = entries.get('manifest.json'),
    dataBytes = entries.get('data.json');
  if (!manifestBytes || !dataBytes)
    throw new Error('This archive is missing manifest.json or data.json.');
  let manifest: ArchiveManifest, payload: { app?: unknown; data?: unknown };
  try {
    manifest = JSON.parse(dec.decode(manifestBytes));
    payload = JSON.parse(dec.decode(dataBytes));
  } catch {
    throw new Error('The archive contains invalid JSON.');
  }
  if (manifest.format !== 'studydesk-archive')
    throw new Error('That file is not a StudyDesk archive.');
  if (manifest.formatVersion !== ARCHIVE_VERSION)
    throw new Error(
      `This archive format version (${String(manifest.formatVersion)}) is not supported by this StudyDesk version.`,
    );
  if (
    !Array.isArray(manifest.entries) ||
    !Array.isArray(manifest.attachments) ||
    payload.app !== 'studydesk'
  )
    throw new Error('The archive manifest is incomplete.');
  const seen = new Set<string>();
  for (const item of manifest.entries) {
    const content = entries.get(item.path);
    if (
      !content ||
      seen.has(item.path) ||
      content.length !== item.size ||
      (await sha(content)) !== item.sha256
    )
      throw new Error(`Integrity check failed for ${item.path}.`);
    seen.add(item.path);
  }
  const data = validateData(payload.data),
    ids = attachmentIds(data);
  if (ids.length !== manifest.attachments.length)
    throw new Error('Attachment metadata does not match the material records.');
  const blobs: BlobEntry[] = [];
  for (let i = 0; i < manifest.attachments.length; i += 1) {
    const item = manifest.attachments[i]!,
      content = entries.get(item.path);
    emit(onProgress, {
      phase: 'reading',
      completed: i,
      total: manifest.attachments.length,
      message: `Checking attachment ${i + 1} of ${manifest.attachments.length}…`,
    });
    if (
      !content ||
      seen.has(item.path) ||
      content.length !== item.size ||
      content.length > MAX_MATERIAL_SIZE_BYTES ||
      (await sha(content)) !== item.sha256 ||
      !ids.includes(item.blobId)
    )
      throw new Error(`Integrity check failed for attachment ${item.blobId}.`);
    seen.add(item.path);
    blobs.push({
      id: item.blobId,
      blob: new Blob([content], { type: item.type || 'application/octet-stream' }),
    });
  }
  return { data, blobs };
}
