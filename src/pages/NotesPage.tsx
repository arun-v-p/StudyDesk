import { useMemo, useState } from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { Pencil, Pin, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import { useStore } from '../store/AppStore';
import { Card, Chip } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { IconButton } from '../components/ui/IconButton';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { TextArea, TextField } from '../components/ui/Field';
import type { Note } from '../types';

export function NotesPage() {
  const { notes, newNote, toast } = useStore();
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', content: '', tags: '' });
  const [error, setError] = useState<string | undefined>();
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? notes.items.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            n.tags.some((t) => t.toLowerCase().includes(q)),
        )
      : notes.items;
    return [...list].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [notes.items, query]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes.items) for (const t of n.tags) set.add(t);
    return [...set].sort();
  }, [notes.items]);

  const openForm = (existing?: Note) => {
    setError(undefined);
    if (existing) {
      setEditingId(existing.id);
      setForm({ title: existing.title, content: existing.content, tags: existing.tags.join(', ') });
    } else {
      setEditingId(null);
      setForm({ title: '', content: '', tags: '' });
    }
    setFormOpen(true);
  };

  const submit = () => {
    if (!form.title.trim()) {
      // The original returned silently here; the user got no idea why nothing happened.
      setError('A title is required.');
      return;
    }
    const tags = form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingId) {
      notes.update(editingId, { title: form.title.trim(), content: form.content.trim(), tags });
      toast({ message: 'Note updated', tone: 'success' });
    } else {
      notes.add(newNote({ title: form.title.trim(), content: form.content.trim(), tags }));
      toast({ message: 'Note saved', tone: 'success' });
    }
    setFormOpen(false);
  };

  const remove = (n: Note) => {
    const removed = notes.remove(n.id);
    setPendingDelete(null);
    if (!removed) return;
    toast({
      message: `Deleted “${removed.item.title}”`,
      tone: 'danger',
      undoLabel: 'Undo',
      onUndo: () => notes.restore(removed.item, removed.index),
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-fg text-xl font-bold tracking-tight">Notes</h2>
          <p className="text-subtle mt-0.5 text-sm">
            {notes.items.length} note{notes.items.length === 1 ? '' : 's'}
            {notes.items.some((n) => n.pinned)
              ? ` · ${notes.items.filter((n) => n.pinned).length} pinned`
              : ''}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search
              className="text-subtle pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2"
              aria-hidden="true"
            />
            <label className="sr-only" htmlFor="note-search">
              Search notes
            </label>
            <input
              id="note-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notes…"
              className="field-input !min-h-9 w-44 !pl-9 !text-xs sm:w-56"
            />
          </div>
          <button type="button" className="btn btn--primary" onClick={() => openForm()}>
            <Plus className="h-4 w-4" aria-hidden="true" /> New note
          </button>
        </div>
      </div>

      {notes.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<StickyNote className="h-7 w-7" aria-hidden="true" />}
            title="No notes yet"
            description="Capture formulas, questions and reading notes. Pin the ones you need on the Today dashboard."
            actions={
              <button type="button" className="btn btn--primary" onClick={() => openForm()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Write your first note
              </button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Search className="h-6 w-6" aria-hidden="true" />}
            title={`No notes match “${query}”`}
            description="Try a different word, or search by tag."
            actions={
              <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
                Clear search
              </button>
            }
          />
        </Card>
      ) : (
        <>
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setQuery(tag)}
                  className="chip chip--neutral hover:border-border-strong"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <ul className="grid [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))] gap-3">
            {visible.map((n) => (
              <Card
                as="li"
                key={n.id}
                interactive
                className={`group relative !p-4 ${n.pinned ? 'border-accent/60' : ''}`}
              >
                {n.pinned && (
                  <Pin
                    className="text-accent absolute top-3.5 right-3.5 h-3.5 w-3.5"
                    aria-label="Pinned"
                    fill="currentColor"
                  />
                )}
                <h3 className="text-fg pr-6 text-sm font-semibold">{n.title}</h3>
                {n.content && (
                  <p className="text-muted mt-1.5 line-clamp-5 text-xs leading-relaxed whitespace-pre-wrap">
                    {n.content}
                  </p>
                )}
                {n.tags.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {n.tags.map((t) => (
                      <Chip key={t} tone="info">
                        #{t}
                      </Chip>
                    ))}
                  </div>
                )}
                <p className="text-subtle mt-3 text-[10.5px]">
                  Edited {formatDistanceToNow(parseISO(n.updatedAt), { addSuffix: true })}
                </p>
                <span className="row-actions absolute right-3 bottom-3 flex gap-0.5">
                  <IconButton
                    aria-label={n.pinned ? `Unpin “${n.title}”` : `Pin “${n.title}”`}
                    size="sm"
                    onClick={() => {
                      notes.update(n.id, { pinned: !n.pinned });
                      toast({ message: n.pinned ? 'Unpinned' : 'Pinned to Today', tone: 'info' });
                    }}
                  >
                    <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    aria-label={`Edit “${n.title}”`}
                    size="sm"
                    onClick={() => openForm(n)}
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    aria-label={`Delete “${n.title}”`}
                    tone="danger"
                    size="sm"
                    onClick={() => setPendingDelete(n)}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  </IconButton>
                </span>
              </Card>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? 'Edit note' : 'New note'}
        footer={
          <>
            <button type="button" className="btn btn--ghost" onClick={() => setFormOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" /> Cancel
            </button>
            <button type="button" className="btn btn--primary" onClick={submit}>
              {editingId ? 'Save changes' : 'Save note'}
            </button>
          </>
        }
      >
        <form
          className="space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <TextField
            label="Title"
            required
            value={form.title}
            error={error}
            onChange={(e) => {
              setForm((f) => ({ ...f, title: e.target.value }));
              setError(undefined);
            }}
            placeholder="e.g. Carnot cycle — key relations"
            autoComplete="off"
          />
          <TextArea
            label="Content"
            rows={8}
            value={form.content}
            onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
            placeholder="Write something…"
          />
          <TextField
            label="Tags"
            value={form.tags}
            onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            placeholder="ME-301, exam"
            hint="Comma-separated. Tags become clickable filters."
            autoComplete="off"
          />
        </form>
      </Modal>

      <ConfirmDialog
        open={pendingDelete != null}
        title="Delete this note?"
        description={pendingDelete ? `“${pendingDelete.title}” will be removed.` : undefined}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete)}
      />
    </div>
  );
}
