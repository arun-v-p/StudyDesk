import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../src/components/ui/Modal';

describe('ConfirmDialog undo guidance', () => {
  it('shows the Undo toast promise by default', () => {
    // ConfirmDialog's promise was false for irreversible material-blob deletion.
    render(<ConfirmDialog open title="Delete item?" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(
      screen.getByText(
        'This cannot be undone from here, but the toast that follows offers an Undo.',
      ),
    ).toBeInTheDocument();
  });

  it('omits Undo guidance when the action cannot be undone', () => {
    // Blob deletion has no restore operation, so its confirmation must not advertise Undo.
    render(
      <ConfirmDialog
        open
        title="Delete file?"
        undoHint={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(
        'This cannot be undone from here, but the toast that follows offers an Undo.',
      ),
    ).not.toBeInTheDocument();
  });
});
