import { describe, expect, it } from 'vitest';
import type { StudyResource } from '../src/types';
import {
  createSharedResourceList,
  isLikelyResourceDuplicate,
  parseSharedResourceList,
  serializeSharedResourceList,
} from '../src/features/sharing/resourceList';

const localResource: StudyResource = {
  id: 'local-id',
  title: 'Cell biology guide',
  url: 'https://example.org/cells',
  description: 'A useful introduction.',
  subject: 'Biology',
  category: 'Reading',
  tags: ['exam review'],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

describe('shareable resource list schema', () => {
  it('round-trips valid v1 data, including explicitly selected tags', () => {
    const serialized = serializeSharedResourceList([localResource], true);
    expect(parseSharedResourceList(serialized)).toEqual({
      format: 'studydesk-resource-list',
      version: 1,
      resources: [
        {
          title: localResource.title,
          url: localResource.url,
          description: localResource.description,
          subject: localResource.subject,
          category: localResource.category,
          tags: localResource.tags,
        },
      ],
    });
  });

  it('excludes local and private fields by default', () => {
    const payload = createSharedResourceList([localResource]);
    const serialized = JSON.stringify(payload);
    expect(Object.keys(payload)).toEqual(['format', 'version', 'resources']);
    expect(Object.keys(payload.resources[0]!)).toEqual([
      'title',
      'url',
      'description',
      'subject',
      'category',
    ]);
    for (const excluded of ['local-id', 'createdAt', 'updatedAt', 'exam review', 'privateNote'])
      expect(serialized).not.toContain(excluded);
  });

  it('rejects malformed JSON, unsafe URLs, and unrecognized/private fields', () => {
    expect(() => parseSharedResourceList('{')).toThrow('not valid JSON');
    const invalidUrl = createSharedResourceList([localResource]);
    invalidUrl.resources[0]!.url = 'javascript:alert(1)';
    expect(() => parseSharedResourceList(JSON.stringify(invalidUrl))).toThrow('invalid or unsafe');
    const privateField = createSharedResourceList([localResource]);
    Object.assign(privateField.resources[0]!, { privateNote: 'keep this local' });
    expect(() => parseSharedResourceList(JSON.stringify(privateField))).toThrow(
      'unsupported fields',
    );
  });

  it('rejects unsupported versions before interpreting records', () => {
    expect(() =>
      parseSharedResourceList(
        JSON.stringify({ format: 'studydesk-resource-list', version: 2, resources: [] }),
      ),
    ).toThrow('version 2 is not supported');
  });

  it('detects likely duplicates by normalized URL or title and subject', () => {
    expect(
      isLikelyResourceDuplicate(
        { title: 'Different label', url: 'https://example.org/cells/#top', subject: 'Other' },
        localResource,
      ),
    ).toBe(true);
    expect(
      isLikelyResourceDuplicate(
        { title: 'Cell biology guide', url: 'https://elsewhere.example/guide', subject: 'Biology' },
        localResource,
      ),
    ).toBe(true);
  });
});
