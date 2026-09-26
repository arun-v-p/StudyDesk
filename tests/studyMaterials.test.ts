import { describe, expect, it } from 'vitest';
import { exportBackup } from '../src/store/backup';
import { KEYS } from '../src/store/AppStore';
import {
  EMPTY_MATERIALS,
  MATERIALS_KEY,
  MATERIALS_SCHEMA_VERSION,
  MAX_MATERIAL_SIZE_BYTES,
  materialKind,
} from '../src/store/materials';

describe('Study Materials persistence boundaries', () => {
  it('accepts only the supported material extensions', () => {
    for (const extension of ['pdf', 'txt', 'md', 'docx']) {
      expect(materialKind(new File(['content'], `notes.${extension}`))).toBe(extension);
    }
    expect(materialKind(new File(['content'], 'notes.exe'))).toBeNull();
    expect(materialKind(new File(['content'], 'notes'))).toBeNull();
  });

  it('uses a versioned metadata shape without embedding binary data', () => {
    const serialized = JSON.stringify({
      v: MATERIALS_SCHEMA_VERSION,
      data: {
        ...EMPTY_MATERIALS,
        files: [{ id: 'file-1', blobId: 'blob-1', name: 'notes.pdf', sizeBytes: 10 }],
      },
    });
    localStorage.setItem(MATERIALS_KEY, serialized);
    const parsed = JSON.parse(localStorage.getItem(MATERIALS_KEY)!);
    expect(parsed.data.files[0]).not.toHaveProperty('blob');
    expect(parsed.data.files[0]).not.toHaveProperty('content');
    expect(Object.values(KEYS)).not.toContain(MATERIALS_KEY);
  });

  it('backs up Study Materials metadata but never embeds file blob bytes', () => {
    // The Phase 1 continuation mandate supersedes the prior test's exclusion of metadata.
    const metadata = {
      ...EMPTY_MATERIALS,
      files: [{ id: 'file-1', blobId: 'blob-1', name: 'notes.pdf', sizeBytes: 10 }],
    };
    localStorage.setItem(MATERIALS_KEY, JSON.stringify({ v: 1, data: metadata }));
    const backup = exportBackup();
    expect(backup.data[MATERIALS_KEY]).toEqual({ v: 1, data: metadata });
    const exportedMetadata = backup.data[MATERIALS_KEY] as {
      data: { files: Array<Record<string, unknown>> };
    };
    expect(exportedMetadata.data.files[0]).not.toHaveProperty('blob');
    expect(exportedMetadata.data.files[0]).not.toHaveProperty('content');
  });

  it('enforces the approved per-file size limit', () => {
    expect(MAX_MATERIAL_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });
});
