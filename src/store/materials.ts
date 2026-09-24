import { useCallback, useEffect, useState } from 'react';
import { createId } from '../lib/id';
import { storage } from '../lib/safeStorage';
import type { StudyMaterialFile, StudyMaterialFolder, StudyMaterialSubject } from '../types';

export const MATERIALS_KEY = 'studydesk.materials.metadata';
export const MATERIALS_SCHEMA_VERSION = 1;
export const MAX_MATERIAL_SIZE_BYTES = 50 * 1024 * 1024;
const DB_NAME = 'studydesk-materials';
const DB_VERSION = 1;
const BLOB_STORE = 'blobs';

export type MaterialKind = 'pdf' | 'txt' | 'md' | 'docx';
export interface MaterialsMetadata {
  subjects: StudyMaterialSubject[];
  folders: StudyMaterialFolder[];
  files: StudyMaterialFile[];
}

export const EMPTY_MATERIALS: MaterialsMetadata = { subjects: [], folders: [], files: [] };

export function materialKind(file: File): MaterialKind | null {
  const ext = file.name.toLowerCase().split('.').pop();
  return ext === 'pdf' || ext === 'txt' || ext === 'md' || ext === 'docx' ? ext : null;
}

function readMetadata(): MaterialsMetadata {
  try {
    const raw = storage.getItem(MATERIALS_KEY);
    if (!raw) return EMPTY_MATERIALS;
    const parsed = JSON.parse(raw) as { v?: number; data?: MaterialsMetadata };
    if (parsed.v !== MATERIALS_SCHEMA_VERSION || !parsed.data) return EMPTY_MATERIALS;
    return {
      subjects: Array.isArray(parsed.data.subjects) ? parsed.data.subjects : [],
      folders: Array.isArray(parsed.data.folders) ? parsed.data.folders : [],
      files: Array.isArray(parsed.data.files) ? parsed.data.files : [],
    };
  } catch (error) {
    console.error('[studydesk] could not read material metadata', error);
    return EMPTY_MATERIALS;
  }
}

function writeMetadata(metadata: MaterialsMetadata): boolean {
  return storage.setItem(
    MATERIALS_KEY,
    JSON.stringify({ v: MATERIALS_SCHEMA_VERSION, data: metadata }),
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser context.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(BLOB_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open material storage.'));
  });
}

function blobRequest<T>(operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(BLOB_STORE, 'readwrite');
        const request = operation(tx.objectStore(BLOB_STORE));
        request.onsuccess = () => {
          db.close();
          resolve(request.result);
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error('Material storage operation failed.'));
        };
      }),
  );
}

export const materialBlobs = {
  put: (id: string, blob: Blob) => blobRequest((store) => store.put(blob, id)),
  get: (id: string) => blobRequest<Blob | undefined>((store) => store.get(id)),
  delete: (id: string) => blobRequest((store) => store.delete(id)),
  listIds: () =>
    blobRequest<IDBValidKey[]>((store) => store.getAllKeys()).then((keys) =>
      keys.filter((key): key is string => typeof key === 'string'),
    ),
};

export async function cleanupOrphanMaterialBlobs(metadata = readMetadata()): Promise<number> {
  const referenced = new Set(metadata.files.map((file) => file.blobId));
  const ids = await materialBlobs.listIds();
  let removed = 0;
  for (const id of ids) {
    if (!referenced.has(id)) {
      await materialBlobs.delete(id);
      removed++;
    }
  }
  return removed;
}

export function useMaterials() {
  const [metadata, setMetadata] = useState(readMetadata);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void cleanupOrphanMaterialBlobs(metadata).catch((reason: unknown) => {
      console.error('[studydesk] could not clean material blobs', reason);
    });
  }, [metadata]);

  const addFile = useCallback(
    async (file: File, subjectId: string, folderId: string | null) => {
      const kind = materialKind(file);
      if (!kind) throw new Error('Supported files are PDF, TXT, Markdown, and DOCX.');
      if (file.size > MAX_MATERIAL_SIZE_BYTES) {
        throw new Error('This file is larger than the 50 MiB Study Materials limit.');
      }
      setError(null);
      const blobId = createId();
      const record: StudyMaterialFile = {
        id: createId(),
        blobId,
        subjectId,
        folderId,
        name: file.name,
        kind,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        lastModified: file.lastModified,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await materialBlobs.put(blobId, file);
      const next = { ...metadata, files: [...metadata.files, record] };
      if (!writeMetadata(next)) {
        await materialBlobs.delete(blobId).catch(() => undefined);
        throw new Error('Material metadata could not be saved. Check browser storage.');
      }
      setMetadata(next);
      return record;
    },
    [metadata],
  );

  const addSubject = useCallback(
    (name: string) => {
      const subject: StudyMaterialSubject = {
        id: createId(),
        name: name.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const next = { ...metadata, subjects: [...metadata.subjects, subject] };
      if (!writeMetadata(next))
        throw new Error('Subject could not be saved. Check browser storage.');
      setMetadata(next);
      return subject;
    },
    [metadata],
  );

  const addFolder = useCallback(
    (name: string, subjectId: string, parentFolderId: string | null = null) => {
      const now = new Date().toISOString();
      const folder: StudyMaterialFolder = {
        id: createId(),
        subjectId,
        name: name.trim(),
        parentFolderId,
        createdAt: now,
        updatedAt: now,
      };
      const next = { ...metadata, folders: [...metadata.folders, folder] };
      if (!writeMetadata(next))
        throw new Error('Folder could not be saved. Check browser storage.');
      setMetadata(next);
      return folder;
    },
    [metadata],
  );

  const renameSubject = useCallback(
    (subjectId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A subject name is required.');
      const next = {
        ...metadata,
        subjects: metadata.subjects.map((subject) =>
          subject.id === subjectId
            ? { ...subject, name: trimmed, updatedAt: new Date().toISOString() }
            : subject,
        ),
      };
      if (!writeMetadata(next)) throw new Error('Subject could not be renamed.');
      setMetadata(next);
    },
    [metadata],
  );

  const renameFolder = useCallback(
    (folderId: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('A folder name is required.');
      const next = {
        ...metadata,
        folders: metadata.folders.map((folder) =>
          folder.id === folderId
            ? { ...folder, name: trimmed, updatedAt: new Date().toISOString() }
            : folder,
        ),
      };
      if (!writeMetadata(next)) throw new Error('Folder could not be renamed.');
      setMetadata(next);
    },
    [metadata],
  );

  const moveFile = useCallback(
    (fileId: string, folderId: string | null) => {
      const next = {
        ...metadata,
        files: metadata.files.map((file) =>
          file.id === fileId ? { ...file, folderId, updatedAt: new Date().toISOString() } : file,
        ),
      };
      if (!writeMetadata(next)) throw new Error('Material location could not be saved.');
      setMetadata(next);
    },
    [metadata],
  );

  const moveFolder = useCallback(
    (folderId: string, parentFolderId: string | null) => {
      const folder = metadata.folders.find((item) => item.id === folderId);
      if (!folder) throw new Error('Folder no longer exists.');
      if (parentFolderId === folderId) throw new Error('A folder cannot contain itself.');
      let parent = parentFolderId;
      while (parent) {
        if (parent === folderId) throw new Error('A folder cannot be moved into its own child.');
        parent = metadata.folders.find((item) => item.id === parent)?.parentFolderId ?? null;
      }
      const next = {
        ...metadata,
        folders: metadata.folders.map((item) =>
          item.id === folderId
            ? { ...item, parentFolderId, updatedAt: new Date().toISOString() }
            : item,
        ),
      };
      if (!writeMetadata(next)) throw new Error('Folder location could not be saved.');
      setMetadata(next);
    },
    [metadata],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      const file = metadata.files.find((item) => item.id === fileId);
      if (!file) return;
      const next = { ...metadata, files: metadata.files.filter((item) => item.id !== fileId) };
      if (!writeMetadata(next)) throw new Error('Material could not be deleted.');
      setMetadata(next);
      await materialBlobs.delete(file.blobId);
    },
    [metadata],
  );

  const replaceFile = useCallback(
    async (fileId: string, replacement: File) => {
      const current = metadata.files.find((file) => file.id === fileId);
      const kind = materialKind(replacement);
      if (!current) throw new Error('Material no longer exists.');
      if (!kind) throw new Error('Supported files are PDF, TXT, Markdown, and DOCX.');
      if (replacement.size > MAX_MATERIAL_SIZE_BYTES)
        throw new Error('This file is larger than the 50 MiB Study Materials limit.');
      const previousBlob = await materialBlobs.get(current.blobId);
      await materialBlobs.put(current.blobId, replacement);
      const next = {
        ...metadata,
        files: metadata.files.map((file) =>
          file.id === fileId
            ? {
                ...file,
                name: replacement.name,
                kind,
                mimeType: replacement.type || 'application/octet-stream',
                sizeBytes: replacement.size,
                lastModified: replacement.lastModified,
                updatedAt: new Date().toISOString(),
              }
            : file,
        ),
      };
      if (!writeMetadata(next)) {
        if (previousBlob) await materialBlobs.put(current.blobId, previousBlob);
        throw new Error('Replacement metadata could not be saved.');
      }
      setMetadata(next);
    },
    [metadata],
  );

  const deleteFolder = useCallback(
    async (folderId: string) => {
      const ids = new Set<string>();
      const collect = (parentId: string) => {
        ids.add(parentId);
        metadata.folders
          .filter((folder) => folder.parentFolderId === parentId)
          .forEach((folder) => collect(folder.id));
      };
      if (!metadata.folders.some((folder) => folder.id === folderId)) return;
      collect(folderId);
      const files = metadata.files.filter((file) => file.folderId && ids.has(file.folderId));
      const next = {
        ...metadata,
        folders: metadata.folders.filter((folder) => !ids.has(folder.id)),
        files: metadata.files.filter((file) => !file.folderId || !ids.has(file.folderId)),
      };
      if (!writeMetadata(next)) throw new Error('Folder could not be deleted.');
      setMetadata(next);
      await Promise.all(files.map((file) => materialBlobs.delete(file.blobId)));
    },
    [metadata],
  );

  const deleteSubject = useCallback(
    async (subjectId: string) => {
      const files = metadata.files.filter((file) => file.subjectId === subjectId);
      const next = {
        ...metadata,
        subjects: metadata.subjects.filter((subject) => subject.id !== subjectId),
        folders: metadata.folders.filter((folder) => folder.subjectId !== subjectId),
        files: metadata.files.filter((file) => file.subjectId !== subjectId),
      };
      if (!writeMetadata(next)) throw new Error('Subject could not be deleted.');
      setMetadata(next);
      await Promise.all(files.map((file) => materialBlobs.delete(file.blobId)));
    },
    [metadata],
  );

  return {
    metadata,
    error,
    setError,
    addFile,
    addSubject,
    addFolder,
    renameSubject,
    renameFolder,
    moveFile,
    moveFolder,
    deleteFile,
    deleteFolder,
    deleteSubject,
    replaceFile,
  };
}
