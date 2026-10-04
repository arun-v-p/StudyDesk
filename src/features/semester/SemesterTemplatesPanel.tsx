import { useMemo, useState } from 'react';
import { Copy, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardHeader } from '../../components/ui/Card';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { TextField } from '../../components/ui/Field';
import { createId } from '../../lib/id';
import { useStore } from '../../store/AppStore';
import {
  applySemesterTemplate,
  createSemesterTemplate,
  refreshSemesterTemplate,
  renameSemesterTemplate,
  validateTemplateName,
} from './semesterTemplates';
import type { SemesterTemplate } from '../../types';

type NameMode = 'create' | 'rename' | null;
type ApplyMode = 'append' | 'replace';

export function SemesterTemplatesPanel() {
  const { timetable, semesterTemplates, toast } = useStore();
  const [nameMode, setNameMode] = useState<NameMode>(null);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
  const [applyMode, setApplyMode] = useState<ApplyMode>('replace');
  const [pendingReplace, setPendingReplace] = useState<{
    template: SemesterTemplate;
    indexes: number[];
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SemesterTemplate | null>(null);
  const [pendingRefresh, setPendingRefresh] = useState<SemesterTemplate | null>(null);

  const previewTemplate = useMemo(
    () => semesterTemplates.items.find((template) => template.id === previewId) ?? null,
    [semesterTemplates.items, previewId],
  );

  const openCreate = () => {
    setName('');
    setNameError(null);
    setEditingId(null);
    setNameMode('create');
  };

  const openRename = (template: SemesterTemplate) => {
    setName(template.name);
    setNameError(null);
    setEditingId(template.id);
    setNameMode('rename');
  };

  const saveName = () => {
    const error = validateTemplateName(name, semesterTemplates.items, editingId ?? undefined);
    setNameError(error);
    if (error) return;
    if (nameMode === 'create') {
      semesterTemplates.add(createSemesterTemplate(createId(), name, timetable.items));
      toast({ message: 'Semester template saved', tone: 'success' });
    } else if (editingId) {
      const template = semesterTemplates.items.find((item) => item.id === editingId);
      if (template) semesterTemplates.update(editingId, renameSemesterTemplate(template, name));
      toast({ message: 'Template renamed', tone: 'success' });
    }
    setNameMode(null);
  };

  const openPreview = (template: SemesterTemplate) => {
    setPreviewId(template.id);
    setSelectedIndexes(template.timetable.map((_entry, index) => index));
    setApplyMode('replace');
  };

  const apply = (template: SemesterTemplate, indexes: number[], mode: ApplyMode) => {
    const previous = timetable.items;
    const result = applySemesterTemplate(template, previous, indexes, mode, createId);
    timetable.setItems(result.items);
    toast({
      message: `Applied ${result.added} class${result.added === 1 ? '' : 'es'}${result.skippedDuplicates ? `; skipped ${result.skippedDuplicates} duplicate${result.skippedDuplicates === 1 ? '' : 's'}` : ''}`,
      tone: 'success',
      undoLabel: 'Undo',
      onUndo: () => timetable.setItems(previous),
    });
  };

  const commitPreview = () => {
    if (!previewTemplate) return;
    if (applyMode === 'replace') {
      setPendingReplace({ template: previewTemplate, indexes: selectedIndexes });
      setPreviewId(null);
      return;
    }
    apply(previewTemplate, selectedIndexes, 'append');
    setPreviewId(null);
  };

  return (
    <>
      <Card>
        <CardHeader
          title="Semester templates"
          action={
            <button
              type="button"
              className="btn btn--primary !min-h-9 !py-1.5"
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> Save current
            </button>
          }
        />
        <p className="text-subtle -mt-2 mb-3.5 text-xs">
          Save and reuse a copy of your weekly timetable.
        </p>
        {semesterTemplates.items.length === 0 ? (
          <p className="text-subtle text-sm">
            Save this timetable as a named template to reuse it next semester.
          </p>
        ) : (
          <ul className="divide-border divide-y">
            {semesterTemplates.items.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center gap-2 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <h3 className="text-fg truncate text-sm font-semibold">{template.name}</h3>
                  <p className="text-subtle text-xs">
                    {template.timetable.length} class{template.timetable.length === 1 ? '' : 'es'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn--ghost !min-h-9 !px-2.5 !py-1.5 !text-xs"
                  onClick={() => openPreview(template)}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Preview
                </button>
                <button
                  type="button"
                  className="btn btn--ghost !min-h-9 !px-2.5 !py-1.5 !text-xs"
                  onClick={() => openRename(template)}
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Rename
                </button>
                <button
                  type="button"
                  className="btn btn--ghost !min-h-9 !px-2.5 !py-1.5 !text-xs"
                  onClick={() => setPendingRefresh(template)}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Update snapshot
                </button>
                <button
                  type="button"
                  className="btn btn--ghost text-danger !min-h-9 !px-2.5 !py-1.5 !text-xs"
                  aria-label={`Delete template ${template.name}`}
                  onClick={() => setPendingDelete(template)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={nameMode != null}
        onClose={() => setNameMode(null)}
        title={nameMode === 'rename' ? 'Rename semester template' : 'Save semester template'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setNameMode(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={saveName}>
              {nameMode === 'rename' ? 'Save name' : 'Save template'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Template name"
            required
            autoComplete="off"
            maxLength={60}
            value={name}
            error={nameError ?? undefined}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="e.g. Autumn semester"
          />
          {nameMode === 'create' && (
            <p className="text-subtle text-xs">
              Saves a copy of the current {timetable.items.length} timetable class
              {timetable.items.length === 1 ? '' : 'es'}. Existing templates are not changed.
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={previewTemplate != null}
        onClose={() => setPreviewId(null)}
        title={previewTemplate ? `Preview ${previewTemplate.name}` : 'Preview template'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setPreviewId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={selectedIndexes.length === 0}
              onClick={commitPreview}
            >
              {applyMode === 'replace' ? 'Start new semester' : 'Add selected classes'}
            </button>
          </>
        }
      >
        {previewTemplate && (
          <div className="space-y-3">
            <p className="text-subtle text-sm">
              {previewTemplate.timetable.length} saved classes · {timetable.items.length} classes
              currently in your timetable. Applying creates new class records; the template stays
              unchanged.
            </p>
            <fieldset className="border-border flex flex-wrap gap-4 rounded-md border p-3">
              <legend className="text-muted px-1 text-xs font-semibold">Apply as</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="template-apply-mode"
                  value="replace"
                  checked={applyMode === 'replace'}
                  onChange={() => setApplyMode('replace')}
                />
                Start new semester (replace current timetable)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="template-apply-mode"
                  value="append"
                  checked={applyMode === 'append'}
                  onChange={() => setApplyMode('append')}
                />
                Add selected classes to current timetable
              </label>
            </fieldset>
            <ul className="max-h-64 space-y-1 overflow-auto">
              {previewTemplate.timetable.map((entry, index) => (
                <li key={`${entry.day}-${entry.startTime}-${entry.subject}-${index}`}>
                  <label className="border-border flex gap-2 rounded-md border p-2.5 text-sm">
                    <input
                      type="checkbox"
                      aria-label={`Include ${entry.subject}, ${entry.startTime}`}
                      checked={selectedIndexes.includes(index)}
                      onChange={(event) => {
                        const checked = event.currentTarget.checked;
                        setSelectedIndexes((indexes) =>
                          checked ? [...indexes, index] : indexes.filter((item) => item !== index),
                        );
                      }}
                    />
                    <span className="text-fg min-w-0 flex-1">
                      {entry.subject} ·{' '}
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][entry.day]}{' '}
                      {entry.startTime}–{entry.endTime}
                      {entry.room ? ` · ${entry.room}` : ''}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {applyMode === 'replace' && (
              <p className="text-warning text-xs">
                Starting a new semester replaces the current timetable after confirmation.
              </p>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={pendingReplace != null}
        title="Replace current timetable?"
        description={`This replaces ${timetable.items.length} current class${timetable.items.length === 1 ? '' : 'es'} with the selected classes from “${pendingReplace?.template.name ?? ''}”. The template itself will not change.`}
        confirmLabel="Replace timetable"
        onCancel={() => setPendingReplace(null)}
        onConfirm={() => {
          if (pendingReplace) apply(pendingReplace.template, pendingReplace.indexes, 'replace');
          setPendingReplace(null);
        }}
      />
      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this semester template?"
        description={pendingDelete?.name}
        confirmLabel="Delete template"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) semesterTemplates.remove(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
      <ConfirmDialog
        open={pendingRefresh != null}
        title="Update saved timetable snapshot?"
        description={`This replaces the classes saved in “${pendingRefresh?.name ?? ''}” with the current timetable.`}
        confirmLabel="Update snapshot"
        onCancel={() => setPendingRefresh(null)}
        onConfirm={() => {
          if (pendingRefresh)
            semesterTemplates.update(
              pendingRefresh.id,
              refreshSemesterTemplate(pendingRefresh, timetable.items),
            );
          setPendingRefresh(null);
          toast({ message: 'Template snapshot updated', tone: 'success' });
        }}
      />
    </>
  );
}
