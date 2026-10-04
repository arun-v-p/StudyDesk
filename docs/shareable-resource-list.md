# Shareable Resource List

StudyDesk resource lists are explicit, local-file transfers. StudyDesk does not upload them or
provide accounts, shared workspaces, public sharing pages, or automatic sharing. A downloaded file
may be sent to other people, so review the export preview and URLs before sharing.

## Version 1 schema

The UTF-8 JSON document has exactly these top-level fields:

```json
{
  "format": "studydesk-resource-list",
  "version": 1,
  "resources": [
    {
      "title": "Open learning resource",
      "url": "https://example.org/learning",
      "description": "A short description",
      "subject": "Biology",
      "category": "Reading"
    }
  ]
}
```

Each resource requires `title`, `url`, `description`, `subject`, and `category`, all strings.
`tags` is an optional array of strings. StudyDesk omits tags unless the user explicitly enables
them in the export preview. Empty descriptions, subjects, and categories are allowed. Resource
titles are limited to 200 characters, URLs to 2,048, descriptions to 4,000, and subject/category
values to 120. Tags are limited to 30 values of at most 60 characters each. A document is limited
to 1 MiB and 500 resources.

No other fields are accepted. In particular, StudyDesk record IDs, timestamps, local-only metadata,
private notes, schedules, tasks, attachment contents, and file paths are not part of this format.
Unknown fields cause import rejection rather than being persisted or silently interpreted.

## Import behavior

Only absolute `http:` and `https:` URLs with a hostname and without embedded credentials are
accepted. Imported title and description values are rendered as text; HTML, Markdown, scripts, and
embedded content are not interpreted. Imports require a supported format and version before any
records are written. Each item can be selected independently. Likely duplicates are pre-unselected;
selecting one explicitly adds a new record and never replaces an existing record.

The app creates the file locally and reads selected files locally. Sharing or uploading the
downloaded file is entirely the user's choice.
