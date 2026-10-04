import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ResourceSharing } from '../src/features/sharing/ResourceSharing';
import { AppStoreProvider, KEYS, useStore } from '../src/store/AppStore';

const existing = {
  id: 'existing-resource',
  title: 'Existing guide',
  url: 'https://example.org/guide',
  description: 'Keep this unchanged',
  subject: 'Biology',
  category: 'Reading',
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

const incomingList = JSON.stringify({
  format: 'studydesk-resource-list',
  version: 1,
  resources: [
    {
      title: 'Updated guide',
      url: 'https://example.org/guide/#section',
      description: 'Possible duplicate',
      subject: 'Biology',
      category: 'Reading',
    },
    {
      title: 'New guide',
      url: 'https://example.org/new',
      description: '<img src=x onerror=alert(1)>',
      subject: 'Chemistry',
      category: 'Reference',
    },
  ],
});

function SharingHarness() {
  const { studyResources } = useStore();
  return (
    <>
      <ResourceSharing />
      <output aria-label="Saved resources">{JSON.stringify(studyResources.items)}</output>
    </>
  );
}

describe('resource sharing import flow', () => {
  it('previews unsafe-looking text, defaults duplicates off, and adds selected items without replacing', async () => {
    localStorage.setItem(KEYS.studyResources, JSON.stringify({ v: 2, data: [existing] }));
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <SharingHarness />
      </AppStoreProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Import shared resource list' }));
    const file = new File([incomingList], 'resources.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => incomingList });
    fireEvent.change(screen.getByLabelText('Choose a shared resource list JSON file'), {
      target: { files: [file] },
    });

    const dialog = await screen.findByRole('dialog', { name: 'Import shared resource list' });
    expect(within(dialog).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(within(dialog).queryByRole('img')).not.toBeInTheDocument();
    const possibleDuplicate = within(dialog).getByRole('checkbox', {
      name: 'Import Updated guide as a new duplicate',
    });
    expect(possibleDuplicate).not.toBeChecked();
    expect(within(dialog).getByRole('checkbox', { name: 'Import New guide' })).toBeChecked();

    await user.click(possibleDuplicate);
    await user.click(within(dialog).getByRole('button', { name: 'Import 2 resources' }));

    await waitFor(() => {
      const records = JSON.parse(screen.getByLabelText('Saved resources').textContent ?? '[]');
      expect(records).toHaveLength(3);
      expect(records[0]).toEqual(existing);
      expect(records[1].id).not.toBe(existing.id);
      expect(records[1].title).toBe('Updated guide');
      expect(records[2].title).toBe('New guide');
    });
  });

  it('shows unsupported-version errors without adding records', async () => {
    const payload = JSON.stringify({
      format: 'studydesk-resource-list',
      version: 99,
      resources: [],
    });
    const user = userEvent.setup();
    render(
      <AppStoreProvider>
        <SharingHarness />
      </AppStoreProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Import shared resource list' }));
    const file = new File([payload], 'future.json', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => payload });
    fireEvent.change(screen.getByLabelText('Choose a shared resource list JSON file'), {
      target: { files: [file] },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('version 99 is not supported');
    expect(screen.getByLabelText('Saved resources')).toHaveTextContent('[]');
  });
});
