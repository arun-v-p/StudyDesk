import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Eye,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { TextField, Select } from '../components/ui/Field';
import { ConfirmDialog, Modal } from '../components/ui/Modal';
import { IconButton } from '../components/ui/IconButton';
import {
  MAX_MATERIAL_SIZE_BYTES,
  materialBlobs,
  useMaterials,
  type MaterialKind,
} from '../store/materials';
import type { StudyMaterialFile, StudyMaterialFolder } from '../types';

const ACCEPT =
  '.pdf,.txt,.md,.docx,application/pdf,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

const kindLabel: Record<MaterialKind, string> = {
  pdf: 'PDF',
  txt: 'TXT',
  md: 'MD',
  docx: 'DOCX',
};

function FileIcon({ kind }: { kind: MaterialKind }) {
  return kind === 'pdf' ? (
    <FileText className="text-danger h-5 w-5 shrink-0" aria-hidden="true" />
  ) : (
    <File className="text-accent h-5 w-5 shrink-0" aria-hidden="true" />
  );
}

export function MaterialsPage() {
  const {
    metadata,
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
  } = useMaterials();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    | {
        type: 'create-subject' | 'create-folder' | 'rename';
        targetId?: string;
        targetKind?: 'subject' | 'folder';
        initial: string;
      }
    | { type: 'move-file' | 'move-folder'; targetId: string; initial: string }
    | null
  >(null);
  const [pendingDelete, setPendingDelete] = useState<
    | { type: 'subject'; id: string; name: string }
    | { type: 'folder'; id: string; name: string }
    | { type: 'file'; id: string; name: string }
    | null
  >(null);
  const [preview, setPreview] = useState<StudyMaterialFile | null>(null);

  const activeSubjectId = subjectId ?? metadata.subjects[0]?.id ?? null;
  const activeSubject = metadata.subjects.find((subject) => subject.id === activeSubjectId);
  const folders = metadata.folders.filter((folder) => folder.subjectId === activeSubjectId);
  const currentFolder = folders.find((folder) => folder.id === folderId);
  const currentFolders = folders.filter((folder) => folder.parentFolderId === folderId);
  const currentFiles = metadata.files.filter(
    (file) => file.subjectId === activeSubjectId && file.folderId === folderId,
  );

  useEffect(() => {
    if (!activeSubjectId || (folderId && !folders.some((folder) => folder.id === folderId))) {
      setFolderId(null);
    }
  }, [activeSubjectId, folderId, folders]);

  const breadcrumbs = useMemo(() => {
    const result: StudyMaterialFolder[] = [];
    let current = currentFolder;
    while (current) {
      result.unshift(current);
      current = folders.find((folder) => folder.id === current?.parentFolderId);
    }
    return result;
  }, [currentFolder, folders]);

  const excludedFolderIds = useMemo(() => {
    const excluded = new Set<string>();
    if (dialog?.type !== 'move-folder') return excluded;
    const collect = (id: string) => {
      excluded.add(id);
      folders
        .filter((folder) => folder.parentFolderId === id)
        .forEach((folder) => collect(folder.id));
    };
    collect(dialog.targetId);
    return excluded;
  }, [dialog, folders]);

  const folderOptions = folders
    .filter((folder) => !excludedFolderIds.has(folder.id))
    .map((folder) => {
      const names: string[] = [folder.name];
      let parent = folder.parentFolderId;
      while (parent) {
        const item = folders.find((candidate) => candidate.id === parent);
        if (!item) break;
        names.unshift(item.name);
        parent = item.parentFolderId;
      }
      return { value: folder.id, label: names.join(' / ') };
    });

  const run = async (action: () => void | Promise<void>) => {
    try {
      await action();
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update Study Materials.');
    }
  };

  const submitDialog = (value: string) => {
    if (!dialog || !value.trim()) return;
    void run(async () => {
      if (dialog.type === 'create-subject') {
        const subject = addSubject(value);
        setSubjectId(subject.id);
        setFolderId(null);
      } else if (dialog.type === 'create-folder') {
        if (activeSubjectId) addFolder(value, activeSubjectId, folderId);
      } else if (dialog.type === 'rename') {
        if (dialog.targetId && dialog.targetKind === 'folder') renameFolder(dialog.targetId, value);
        else if (dialog.targetId) renameSubject(dialog.targetId, value);
      } else if (dialog.type === 'move-file') {
        moveFile(dialog.targetId, value === '__root__' ? null : value);
      } else if (dialog.type === 'move-folder') {
        moveFolder(dialog.targetId, value === '__root__' ? null : value);
      }
      setDialog(null);
    });
  };

  const importFile = async (file: File) => {
    if (!activeSubjectId) {
      setMessage('Create a subject before importing a material.');
      return;
    }
    await run(async () => {
      await addFile(file, activeSubjectId, folderId);
    });
  };

  const openPreview = async (file: StudyMaterialFile) => {
    setPreview(file);
  };

  const handleDelete = () => {
    if (!pendingDelete) return;
    const item = pendingDelete;
    void run(async () => {
      if (item.type === 'subject') {
        await deleteSubject(item.id);
        setSubjectId(null);
        setFolderId(null);
      } else if (item.type === 'folder') {
        await deleteFolder(item.id);
        setFolderId(item.id === folderId ? null : folderId);
      } else {
        await deleteFile(item.id);
      }
      setPendingDelete(null);
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Study Materials</h2>
          <p className="text-subtle mt-0.5 text-sm">
            Organize PDFs, notes and documents into folders stored in this browser.
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setDialog({ type: 'create-folder', initial: '' })}
            disabled={!activeSubjectId}
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" /> New folder
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => inputRef.current?.click()}
            disabled={!activeSubjectId}
          >
            <Upload className="h-4 w-4" aria-hidden="true" /> Upload
          </button>
        </div>
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept={ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void importFile(file);
          }}
        />
      </div>

      {message && (
        <p role="alert" className="text-danger text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <Card className="h-fit">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-fg text-sm font-semibold">Subjects</h3>
            <IconButton
              aria-label="Create subject"
              size="sm"
              onClick={() => setDialog({ type: 'create-subject', initial: '' })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
          <div className="space-y-1">
            {metadata.subjects.map((subject) => (
              <div
                key={subject.id}
                className={`group flex items-center gap-1 rounded-md px-2 py-1.5 ${
                  subject.id === activeSubjectId ? 'bg-accent/10 text-accent' : 'text-muted'
                }`}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                  onClick={() => {
                    setSubjectId(subject.id);
                    setFolderId(null);
                  }}
                >
                  <FolderOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{subject.name}</span>
                </button>
                <IconButton
                  aria-label={`Rename ${subject.name}`}
                  size="sm"
                  onClick={() =>
                    setDialog({
                      type: 'rename',
                      targetId: subject.id,
                      targetKind: 'subject',
                      initial: subject.name,
                    })
                  }
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </IconButton>
                <IconButton
                  aria-label={`Delete ${subject.name}`}
                  size="sm"
                  tone="danger"
                  onClick={() =>
                    setPendingDelete({ type: 'subject', id: subject.id, name: subject.name })
                  }
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </IconButton>
              </div>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--ghost mt-4 w-full text-xs"
            onClick={() => setDialog({ type: 'create-subject', initial: '' })}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> New subject
          </button>
        </Card>

        <Card className="min-w-0">
          {!activeSubject ? (
            <EmptyState
              icon={<Folder className="h-7 w-7" aria-hidden="true" />}
              title="Create your first subject folder"
              description="Subjects are the root folders for your Study Materials."
              actions={
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => setDialog({ type: 'create-subject', initial: '' })}
                >
                  <Plus className="h-4 w-4" aria-hidden="true" /> Create subject
                </button>
              }
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-1 text-sm">
                <button
                  type="button"
                  className="text-accent font-medium hover:underline"
                  onClick={() => setFolderId(null)}
                >
                  {activeSubject.name}
                </button>
                {breadcrumbs.map((folder) => (
                  <span key={folder.id} className="flex items-center gap-1">
                    <span className="text-subtle">/</span>
                    <button
                      type="button"
                      className={`hover:underline ${folder.id === folderId ? 'text-fg font-medium' : 'text-accent'}`}
                      onClick={() => setFolderId(folder.id)}
                    >
                      {folder.name}
                    </button>
                  </span>
                ))}
                <div className="ml-auto flex gap-1">
                  {currentFolder && (
                    <>
                      <IconButton
                        aria-label={`Rename ${currentFolder.name}`}
                        size="sm"
                        onClick={() =>
                          setDialog({
                            type: 'rename',
                            targetId: currentFolder.id,
                            targetKind: 'folder',
                            initial: currentFolder.name,
                          })
                        }
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        aria-label={`Delete ${currentFolder.name}`}
                        size="sm"
                        tone="danger"
                        onClick={() =>
                          setPendingDelete({
                            type: 'folder',
                            id: currentFolder.id,
                            name: currentFolder.name,
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </>
                  )}
                </div>
              </div>

              {(currentFolders.length > 0 || currentFiles.length > 0) && (
                <div className="divide-line border-line divide-y overflow-hidden rounded-lg border">
                  {currentFolders.map((folder) => (
                    <div
                      key={folder.id}
                      className="group hover:bg-sunken flex items-center gap-3 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onDoubleClick={() => setFolderId(folder.id)}
                        onClick={() => setFolderId(folder.id)}
                      >
                        <Folder className="text-accent h-5 w-5 shrink-0" aria-hidden="true" />
                        <span className="truncate text-sm font-medium">{folder.name}</span>
                      </button>
                      <div className="flex gap-1 opacity-70">
                        <IconButton
                          aria-label={`Move ${folder.name}`}
                          size="sm"
                          onClick={() =>
                            setDialog({
                              type: 'move-folder',
                              targetId: folder.id,
                              initial: folder.parentFolderId ?? '__root__',
                            })
                          }
                        >
                          <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          aria-label={`Rename ${folder.name}`}
                          size="sm"
                          onClick={() =>
                            setDialog({
                              type: 'rename',
                              targetId: folder.id,
                              targetKind: 'folder',
                              initial: folder.name,
                            })
                          }
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete ${folder.name}`}
                          size="sm"
                          tone="danger"
                          onClick={() =>
                            setPendingDelete({ type: 'folder', id: folder.id, name: folder.name })
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                  {currentFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group hover:bg-sunken flex items-center gap-3 px-3 py-2.5"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => void openPreview(file)}
                      >
                        <FileIcon kind={file.kind} />
                        <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
                        <Chip tone="neutral">{kindLabel[file.kind]}</Chip>
                        <span className="text-subtle hidden text-xs sm:inline">
                          {formatSize(file.sizeBytes)}
                        </span>
                      </button>
                      <div className="flex gap-1 opacity-70">
                        <IconButton
                          aria-label={`Open ${file.name}`}
                          size="sm"
                          onClick={() => void openPreview(file)}
                        >
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          aria-label={`Move ${file.name}`}
                          size="sm"
                          onClick={() =>
                            setDialog({
                              type: 'move-file',
                              targetId: file.id,
                              initial: file.folderId ?? '__root__',
                            })
                          }
                        >
                          <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                        <IconButton
                          aria-label={`Delete ${file.name}`}
                          size="sm"
                          tone="danger"
                          onClick={() =>
                            setPendingDelete({ type: 'file', id: file.id, name: file.name })
                          }
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {currentFolders.length === 0 && currentFiles.length === 0 && (
                <EmptyState
                  compact
                  icon={<FolderPlus className="h-6 w-6" aria-hidden="true" />}
                  title="This folder is empty"
                  description="Create a subfolder or upload a material here."
                />
              )}
              <p className="text-subtle mt-4 text-xs">
                Files up to {formatSize(MAX_MATERIAL_SIZE_BYTES)}. Metadata is separate from the
                existing JSON backup.
              </p>
            </>
          )}
        </Card>
      </div>

      {dialog && (
        <Modal
          open
          onClose={() => setDialog(null)}
          title={
            dialog.type === 'create-subject'
              ? 'New subject'
              : dialog.type === 'create-folder'
                ? 'New folder'
                : dialog.type === 'rename'
                  ? 'Rename'
                  : dialog.type === 'move-file'
                    ? 'Move file'
                    : 'Move folder'
          }
          footer={
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => {
                  const input = document.querySelector<HTMLInputElement>(
                    '[data-material-dialog-input]',
                  );
                  if (input) submitDialog(input.value);
                }}
              >
                Save
              </button>
            </>
          }
        >
          {dialog.type === 'move-file' || dialog.type === 'move-folder' ? (
            <Select
              label="Destination"
              data-material-dialog-input
              defaultValue={dialog.initial}
              options={[
                { value: '__root__', label: `${activeSubject?.name ?? 'Subject'} (root)` },
                ...folderOptions,
              ]}
            />
          ) : (
            <TextField
              label="Name"
              data-material-dialog-input
              defaultValue={dialog.initial}
              onKeyDown={(event) => {
                if (event.key === 'Enter') submitDialog(event.currentTarget.value);
              }}
            />
          )}
        </Modal>
      )}

      <ConfirmDialog
        open={pendingDelete != null}
        title={`Delete ${pendingDelete?.name ?? 'item'}?`}
        description={
          pendingDelete?.type === 'folder' || pendingDelete?.type === 'subject'
            ? 'All nested folders and files will be deleted from this browser.'
            : 'The file and its stored content will be deleted.'
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleDelete}
      />

      {preview && <MaterialPreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function MaterialPreview({ file, onClose }: { file: StudyMaterialFile; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void materialBlobs
      .get(file.blobId)
      .then(async (blob) => {
        if (!active || !blob) {
          if (active) setError('The stored file could not be found.');
          return;
        }
        const objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        if (file.kind === 'txt' || file.kind === 'md') setText(await blob.text());
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'The file could not be opened.');
      });
    return () => {
      active = false;
      setUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
    };
  }, [file]);

  return (
    <Modal open onClose={onClose} title={file.name} width="max-w-4xl">
      {error ? (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      ) : file.kind === 'pdf' && url ? (
        <iframe
          title={file.name}
          src={url}
          className="border-line h-[70vh] w-full rounded-md border"
        />
      ) : file.kind === 'txt' || file.kind === 'md' ? (
        <pre className="bg-sunken max-h-[70vh] overflow-auto rounded-md p-4 text-sm whitespace-pre-wrap">
          {text ?? 'Loading…'}
        </pre>
      ) : (
        <div className="space-y-4">
          <p className="text-muted text-sm">
            DOCX files are kept intact and can be opened or downloaded.
          </p>
          {url && (
            <div className="flex gap-2">
              <a className="btn btn--primary" href={url} target="_blank" rel="noreferrer">
                <Eye className="h-4 w-4" aria-hidden="true" /> Open
              </a>
              <a className="btn btn--ghost" href={url} download={file.name}>
                <Download className="h-4 w-4" aria-hidden="true" /> Download
              </a>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
