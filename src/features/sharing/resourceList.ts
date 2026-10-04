import type { StudyResource } from '../../types';

export const RESOURCE_LIST_FORMAT = 'studydesk-resource-list';
export const RESOURCE_LIST_VERSION = 1;
export const MAX_RESOURCE_LIST_BYTES = 1024 * 1024;
export const MAX_SHARED_RESOURCES = 500;

export interface SharedResource {
  title: string;
  url: string;
  description: string;
  subject: string;
  category: string;
  tags?: string[];
}

export interface SharedResourceList {
  format: typeof RESOURCE_LIST_FORMAT;
  version: typeof RESOURCE_LIST_VERSION;
  resources: SharedResource[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isSafeResourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function validateSharedResource(value: unknown, index: number): SharedResource {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['title', 'url', 'description', 'subject', 'category', 'tags'])
  )
    throw new Error(`Resource ${index + 1} contains unsupported fields.`);
  const { title, url, description, subject, category, tags } = value;
  if (
    typeof title !== 'string' ||
    title.trim().length === 0 ||
    title.length > 200 ||
    typeof url !== 'string' ||
    url.length > 2048 ||
    !isSafeResourceUrl(url) ||
    typeof description !== 'string' ||
    description.length > 4000 ||
    typeof subject !== 'string' ||
    subject.length > 120 ||
    typeof category !== 'string' ||
    category.length > 120 ||
    (tags !== undefined &&
      (!Array.isArray(tags) ||
        tags.length > 30 ||
        !tags.every((tag) => typeof tag === 'string' && tag.length <= 60)))
  ) {
    throw new Error(`Resource ${index + 1} has invalid or unsafe values.`);
  }
  return {
    title: title.trim(),
    url: url.trim(),
    description: description.trim(),
    subject: subject.trim(),
    category: category.trim(),
    ...(tags === undefined ? {} : { tags: tags.map((tag) => tag.trim()) }),
  };
}

export function createSharedResourceList(
  resources: StudyResource[],
  includeTags = false,
): SharedResourceList {
  return {
    format: RESOURCE_LIST_FORMAT,
    version: RESOURCE_LIST_VERSION,
    resources: resources.map((resource) => ({
      title: resource.title,
      url: resource.url,
      description: resource.description,
      subject: resource.subject,
      category: resource.category,
      ...(includeTags && resource.tags.length > 0 ? { tags: [...resource.tags] } : {}),
    })),
  };
}

export function serializeSharedResourceList(
  resources: StudyResource[],
  includeTags = false,
): string {
  return JSON.stringify(createSharedResourceList(resources, includeTags), null, 2);
}

export function parseSharedResourceList(text: string): SharedResourceList {
  if (new TextEncoder().encode(text).byteLength > MAX_RESOURCE_LIST_BYTES)
    throw new Error('This resource list is larger than the 1 MiB import limit.');

  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isRecord(value) || !hasOnlyKeys(value, ['format', 'version', 'resources']))
    throw new Error('This is not a supported StudyDesk resource list.');
  if (value.format !== RESOURCE_LIST_FORMAT)
    throw new Error('This is not a StudyDesk resource list.');
  if (value.version !== RESOURCE_LIST_VERSION)
    throw new Error(`Resource list version ${String(value.version)} is not supported.`);
  if (!Array.isArray(value.resources) || value.resources.length > MAX_SHARED_RESOURCES)
    throw new Error(`A resource list may contain up to ${MAX_SHARED_RESOURCES} resources.`);

  return {
    format: RESOURCE_LIST_FORMAT,
    version: RESOURCE_LIST_VERSION,
    resources: value.resources.map(validateSharedResource),
  };
}

export function resourceDuplicateKey(
  resource: Pick<SharedResource, 'title' | 'url' | 'subject'>,
): string {
  const url = new URL(resource.url);
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  const title = resource.title.trim().toLocaleLowerCase();
  const subject = resource.subject.trim().toLocaleLowerCase();
  return `${url.href.toLocaleLowerCase()}|${title}|${subject}`;
}

export function isLikelyResourceDuplicate(
  candidate: Pick<SharedResource, 'title' | 'url' | 'subject'>,
  existing: Pick<StudyResource, 'title' | 'url' | 'subject'>,
): boolean {
  const candidateUrl = new URL(candidate.url);
  const existingUrl = new URL(existing.url);
  candidateUrl.hash = '';
  existingUrl.hash = '';
  if (candidateUrl.pathname.length > 1)
    candidateUrl.pathname = candidateUrl.pathname.replace(/\/+$/, '');
  if (existingUrl.pathname.length > 1)
    existingUrl.pathname = existingUrl.pathname.replace(/\/+$/, '');
  if (candidateUrl.href.toLocaleLowerCase() === existingUrl.href.toLocaleLowerCase()) return true;
  return (
    candidate.title.trim().toLocaleLowerCase() === existing.title.trim().toLocaleLowerCase() &&
    candidate.subject.trim().toLocaleLowerCase() === existing.subject.trim().toLocaleLowerCase()
  );
}
