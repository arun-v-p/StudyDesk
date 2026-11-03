import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync('supabase/migrations/202611030001_studydesk_sync.sql', 'utf8');

describe('StudyDesk sync migration', () => {
  // Prevent a fresh installation from creating sync tables without authenticated-user row security.
  it('creates the table with the existing authenticated-user RLS boundaries', () => {
    expect(migration).toMatch(/create table if not exists public\.study_records/i);
    expect(migration).toMatch(/alter table public\.study_records enable row level security/i);
    expect(migration).toMatch(
      /using\s*\(\(select auth\.uid\(\)\) = user_id\)[\s\S]*with check\s*\(\(select auth\.uid\(\)\) = user_id\)/i,
    );
    expect(migration).toMatch(/security invoker/i);
    expect(migration).toMatch(/grant execute on function[\s\S]*to authenticated/i);
  });

  // Prevent rerunning the setup SQL from failing on already-created policies or duplicate publication membership.
  it('can be applied again without weakening policies or duplicating realtime publication membership', () => {
    expect(migration.match(/drop policy if exists/gi)).toHaveLength(3);
    expect(migration).toMatch(
      /if not exists\s*\([\s\S]*from pg_publication_tables[\s\S]*alter publication supabase_realtime add table public\.study_records/i,
    );
    expect(migration).toMatch(/where public\.study_records\.updated_at <= excluded\.updated_at/i);
    expect(migration).toMatch(/return to_jsonb\(saved\)/i);
  });
});
