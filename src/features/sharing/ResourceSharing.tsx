import { useRef, useState } from 'react';
import { Download, ExternalLink, FileUp, Link2, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal';
import { TextArea, TextField } from '../../components/ui/Field';
import { createId } from '../../lib/id';
import { useStore } from '../../store/AppStore';
import type { StudyResource } from '../../types';
import {
  isLikelyResourceDuplicate,
  isSafeResourceUrl,
  MAX_RESOURCE_LIST_BYTES,
  parseSharedResourceList,
  serializeSharedResourceList,
  type SharedResource,
} from './resourceList';

type TransferMode = 'create' | 'export' | 'import' | null;
type IncomingResource = { resource: SharedResource; selected: boolean; duplicate: boolean };

export function ResourceSharing() {
  const { studyResources, toast } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<TransferMode>(null);
  const [includeTags, setIncludeTags] = useState(false);
  const [incoming, setIncoming] = useState<IncomingResource[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const beginExport = () => {
    setIncludeTags(false);
    setMode('export');
  };

  const beginImport = () => {
    setIncoming([]);
    setImportError(null);
    setMode('import');
  };

  const readImport = async (file: File) => {
    setImportError(null);
    try {
      if (file.size > MAX_RESOURCE_LIST_BYTES)
        throw new Error('This resource list is larger than the 1 MiB import limit.');
      const parsed = parseSharedResourceList(await file.text());
      const seen: SharedResource[] = [];
      setIncoming(
        parsed.resources.map((resource) => {
          const duplicate =
            studyResources.items.some((existing) =>
              isLikelyResourceDuplicate(resource, existing),
            ) || seen.some((prior) => isLikelyResourceDuplicate(resource, prior as StudyResource));
          seen.push(resource);
          return { resource, duplicate, selected: !duplicate };
        }),
      );
    } catch (error) {
      setIncoming([]);
      setImportError(error instanceof Error ? error.message : 'Could not read this resource list.');
    }
  };

  const importSelected = () => {
    const selected = incoming.filter((row) => row.selected);
    const now = new Date().toISOString();
    for (const { resource } of selected) {
      studyResources.add({
        ...resource,
        tags: resource.tags ?? [],
        id: createId(),
        createdAt: now,
        updatedAt: now,
      });
    }
    toast({
      message: `Imported ${selected.length} resource${selected.length === 1 ? '' : 's'} as new local records.`,
      tone: 'success',
    });
    setMode(null);
  };

  const downloadExport = () => {
    const blob = new Blob([serializeSharedResourceList(studyResources.items, includeTags)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'studydesk-resource-list.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMode(null);
  };

  const createResource = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError(null);
    const form = new FormData(event.currentTarget);
    const url = String(form.get('url') ?? '').trim();
    if (!isSafeResourceUrl(url)) {
      setCreateError('Use a valid HTTP or HTTPS URL without embedded credentials.');
      return;
    }
    const now = new Date().toISOString();
    studyResources.add({
      id: createId(),
      title: String(form.get('title') ?? '').trim(),
      url,
      description: String(form.get('description') ?? '').trim(),
      subject: String(form.get('subject') ?? '').trim(),
      category: String(form.get('category') ?? '').trim(),
      tags: String(form.get('tags') ?? '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
        .slice(0, 30),
      createdAt: now,
      updatedAt: now,
    });
    setMode(null);
  };

  const selectedCount = incoming.filter((row) => row.selected).length;
  const exportFieldList = [
    'title',
    'url',
    'description',
    'subject',
    'category',
    ...(includeTags && studyResources.items.some((resource) => resource.tags.length > 0)
      ? ['tags']
      : []),
  ];

  return (
    <section
      className="border-line space-y-3 border-b pb-5"
      aria-labelledby="share-resources-title"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3
            id="share-resources-title"
            className="text-fg flex items-center gap-2 text-base font-semibold"
          >
            <Link2 className="text-accent h-4 w-4" aria-hidden="true" /> Shareable resources
          </h3>
          <p className="text-subtle mt-1 text-sm">
            Keep useful links here, then export a previewed JSON list to share by file.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn--ghost" onClick={beginImport}>
            <FileUp className="h-4 w-4" aria-hidden="true" /> Import shared resource list
          </button>
          <button type="button" className="btn btn--ghost" onClick={beginExport}>
            <Download className="h-4 w-4" aria-hidden="true" /> Export shareable resource list
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setMode('create')}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Add link
          </button>
        </div>
      </div>

      <p className="border-warning/40 bg-warning-soft text-warning rounded-md border p-3 text-xs">
        Exports may be sent to other people. StudyDesk never uploads this data. Private notes,
        schedules, tasks, attachment contents, local IDs, and timestamps are excluded by design.
      </p>

      {studyResources.items.length === 0 ? (
        <p className="text-subtle text-sm">No saved links yet.</p>
      ) : (
        <ul className="divide-line divide-y">
          {studyResources.items.map((resource) => (
            <li key={resource.id} className="flex min-w-0 items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <a
                  className="text-accent inline-flex max-w-full items-center gap-1 text-sm font-medium hover:underline"
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span className="truncate">{resource.title}</span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </a>
                {resource.description && (
                  <p className="text-muted mt-1 text-sm">{resource.description}</p>
                )}
                <p className="text-subtle mt-1 text-xs">
                  {[resource.subject, resource.category].filter(Boolean).join(' · ') ||
                    'Uncategorized'}
                </p>
              </div>
              <button
                type="button"
                className="icon-button text-danger"
                aria-label={`Remove ${resource.title}`}
                onClick={() => studyResources.remove(resource.id)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        className="sr-only"
        type="file"
        accept=".json,application/json"
        aria-label="Choose a shared resource list JSON file"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void readImport(file);
          event.currentTarget.value = '';
        }}
      />

      <Modal
        open={mode === 'create'}
        onClose={() => setMode(null)}
        title="Add a study link"
        footer={null}
      >
        <form className="space-y-3" onSubmit={createResource}>
          <TextField label="Title" name="title" required maxLength={200} />
          <TextField label="URL" name="url" type="url" required maxLength={2048} />
          <TextArea label="Description" name="description" rows={3} maxLength={4000} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Subject" name="subject" maxLength={120} />
            <TextField label="Category" name="category" maxLength={120} />
          </div>
          <TextField
            label="Tags"
            name="tags"
            hint="Optional, comma-separated. Tags are not exported unless selected in the export preview."
            maxLength={500}
          />
          {createError && (
            <p role="alert" className="text-danger text-sm">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary">
              Save link
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={mode === 'export'}
        onClose={() => setMode(null)}
        title="Export shareable resource list"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={studyResources.items.length === 0}
              onClick={downloadExport}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> Download JSON
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-muted text-sm">
            This file stays on your device until you choose to send it. StudyDesk does not upload
            it. Exports may be sent to other people. URLs are shared as entered; check them for
            personal details or access tokens before downloading.
          </p>
          <p className="text-subtle text-xs">
            Exact fields: <code>{['format', 'version', 'resources'].join(', ')}</code> at the top
            level; each resource includes <code>{exportFieldList.join(', ')}</code>. Private notes,
            schedules, tasks, attachments, local IDs, and timestamps are not included.
          </p>
          <label className="border-line flex items-start gap-2 rounded-md border p-3 text-sm">
            <input
              type="checkbox"
              checked={includeTags}
              onChange={(event) => setIncludeTags(event.currentTarget.checked)}
            />
            <span>Include optional tags in the shared file</span>
          </label>
          {studyResources.items.length === 0 ? (
            <p className="text-subtle text-sm">Add a link before exporting.</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-auto">
              {studyResources.items.map((resource) => (
                <li key={resource.id} className="border-line rounded-md border p-3">
                  <p className="text-fg text-sm font-medium">{resource.title}</p>
                  <p className="text-accent text-xs break-all">{resource.url}</p>
                  <p className="text-muted mt-1 text-xs">
                    {resource.description || 'No description'}
                  </p>
                  <p className="text-subtle mt-1 text-xs">
                    {[resource.subject, resource.category].filter(Boolean).join(' · ') ||
                      'Uncategorized'}
                    {includeTags && resource.tags.length > 0
                      ? ` · Tags: ${resource.tags.join(', ')}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal
        open={mode === 'import'}
        onClose={() => setMode(null)}
        title="Import shared resource list"
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setMode(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={selectedCount === 0}
              onClick={importSelected}
            >
              Import {selectedCount} resource{selectedCount === 1 ? '' : 's'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <button type="button" className="btn btn--ghost" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4" aria-hidden="true" /> Choose JSON file
          </button>
          <p className="text-subtle text-xs">
            The file is validated before any local write. Imported text is shown as text, links must
            use HTTP or HTTPS, and imported records are always added as new items.
          </p>
          {importError && (
            <p role="alert" className="text-danger text-sm">
              {importError}
            </p>
          )}
          {incoming.length > 0 && (
            <ul className="max-h-72 space-y-2 overflow-auto">
              {incoming.map(({ resource, duplicate }, index) => (
                <li key={`${resource.url}-${index}`}>
                  <label className="border-line flex items-start gap-2 rounded-md border p-3 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Import ${resource.title}${duplicate ? ' as a new duplicate' : ''}`}
                      checked={incoming[index]!.selected}
                      onChange={(event) => {
                        const selected = event.currentTarget.checked;
                        setIncoming((rows) =>
                          rows.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, selected } : row,
                          ),
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-fg block font-medium">{resource.title}</span>
                      <span className="text-accent block text-xs break-all">{resource.url}</span>
                      <span className="text-subtle mt-1 block text-xs">
                        {[resource.subject, resource.category].filter(Boolean).join(' · ') ||
                          'Uncategorized'}
                        {duplicate ? ' · possible duplicate; selected means add as new' : ''}
                      </span>
                      {resource.description && (
                        <span className="text-muted mt-1 block text-xs whitespace-pre-wrap">
                          {resource.description}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>
    </section>
  );
}
