-- StudyDesk cloud-sync foundation. Apply with `supabase db push` or paste into
-- the Supabase SQL Editor before enabling sync in the deployed application.

create table if not exists public.study_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in (
    'tasks', 'deadlines', 'timetable', 'notes', 'planner', 'revision_plans',
    'calendar_events', 'semester_templates', 'study_resources', 'settings',
    'exam_timetable', 'materials_metadata', 'timer'
  )),
  item_id text not null check (char_length(item_id) between 1 and 200),
  payload jsonb,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  primary key (user_id, scope, item_id),
  constraint study_records_live_payload check (
    (deleted_at is null and payload is not null) or (deleted_at is not null and payload is null)
  )
);

alter table public.study_records enable row level security;
revoke all on public.study_records from anon;
grant select, insert, update on public.study_records to authenticated;

drop policy if exists "StudyDesk users read their own records" on public.study_records;
drop policy if exists "StudyDesk users insert their own records" on public.study_records;
drop policy if exists "StudyDesk users update their own records" on public.study_records;

create policy "StudyDesk users read their own records"
on public.study_records for select to authenticated
using ((select auth.uid()) = user_id);

create policy "StudyDesk users insert their own records"
on public.study_records for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "StudyDesk users update their own records"
on public.study_records for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Return the authoritative row so clients can reconcile timestamp ties/no-op writes.
drop function if exists public.sync_studydesk_record(text, text, jsonb, timestamptz, timestamptz);
create function public.sync_studydesk_record(
  p_scope text,
  p_item_id text,
  p_payload jsonb,
  p_updated_at timestamptz,
  p_deleted_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved public.study_records%rowtype;
begin
  insert into public.study_records (user_id, scope, item_id, payload, updated_at, deleted_at)
  values (auth.uid(), p_scope, p_item_id, p_payload, p_updated_at, p_deleted_at)
  on conflict (user_id, scope, item_id) do update
  set payload = excluded.payload,
      updated_at = excluded.updated_at,
      deleted_at = excluded.deleted_at
  where public.study_records.updated_at <= excluded.updated_at
  returning * into saved;

  if not found then
    select * into saved
    from public.study_records
    where user_id = auth.uid()
      and scope = p_scope
      and item_id = p_item_id;
  end if;

  return to_jsonb(saved);
end;
$$;

revoke all on function public.sync_studydesk_record(text, text, jsonb, timestamptz, timestamptz) from public;
grant execute on function public.sync_studydesk_record(text, text, jsonb, timestamptz, timestamptz) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'study_records'
  ) then
    alter publication supabase_realtime add table public.study_records;
  end if;
end;
$$;
