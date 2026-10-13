-- JobAssistUI — job index: employer-board postings stored in Postgres so a
-- search reads one table instead of fetching 260 job boards live.
-- Filled by the refresh job (apps/web/app/api/cron/refresh-jobs), which runs
-- with the service-role key. Users can only read.
-- Apply with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- Safe to run twice.

-- ─── job_postings ───────────────────────────────────────────────────────────
-- One row per open US posting on a Greenhouse, Lever or Ashby board listed in
-- apps/web/lib/jobs/companies.ts. Postings that are clearly outside the US
-- (isLikelyUS() in filters.ts) are not stored, to keep the table small.
-- USAJOBS / Adzuna / Arbeitnow are NOT stored here; they are searched live.
create table if not exists public.job_postings (
  -- Same as JobPosting.id: "<source>:<board slug>:<native id>".
  id text primary key,
  source text not null,
  board_slug text not null,
  company text not null,
  title text not null,
  location text not null default '',
  remote boolean not null default false,
  url text not null,
  apply_url text,
  posted_at timestamptz,
  -- Plain text, capped at 4000 characters (DESCRIPTION_MAX_CHARS).
  description_text text not null default '',
  -- Hash of the fields above. The refresh only rewrites a row when it changed.
  content_hash text not null default '',
  -- When this row was last written (inserted or changed).
  refreshed_at timestamptz not null default now()
);

-- Full-text search over title + company + description. This is an index on an
-- expression, not a stored tsvector column: with ~45k postings a stored,
-- weighted tsvector was 200MB on its own (measured), more than the rest of the
-- table. search_job_postings() checks title matches separately, which is what
-- weight A was for. Queries must use this exact expression to hit the index.
create index if not exists job_postings_search_idx
  on public.job_postings using gin (
    to_tsvector('english'::regconfig, title || ' ' || company || ' ' || description_text)
  );
create index if not exists job_postings_board_slug_idx
  on public.job_postings (board_slug, source);
create index if not exists job_postings_posted_at_idx
  on public.job_postings (posted_at desc nulls last);

alter table public.job_postings enable row level security;

-- Signed-in users can read. No insert/update/delete policies: only the
-- service role (which bypasses RLS) writes.
drop policy if exists "job_postings_select_authenticated" on public.job_postings;
create policy "job_postings_select_authenticated" on public.job_postings
  for select to authenticated using (true);

-- ─── job_board_status ───────────────────────────────────────────────────────
-- One row per board: did the last refresh work, and how many jobs it had.
-- Shown on /admin (read with the service role). No policies, so nobody else
-- can read or write it.
create table if not exists public.job_board_status (
  key text primary key,             -- "greenhouse:carvana"
  ok boolean not null,
  -- US postings the board listed on the last fetch that worked (kept as is
  -- when a fetch fails).
  count int not null default 0,
  error text,
  refreshed_at timestamptz not null default now(),
  last_ok_at timestamptz,
  -- Hash over every (id, content_hash) of the board. Set only when the stored
  -- rows match the board exactly. Same hash next run = nothing to write.
  board_hash text
);
alter table public.job_board_status add column if not exists board_hash text;

alter table public.job_board_status enable row level security;

-- ─── job_board_diff ─────────────────────────────────────────────────────────
-- Used by the refresh job (service role only). Compares one board's fresh
-- (id, content_hash) list with the stored rows inside the database, so the
-- refresh doesn't download every stored hash every hour.
-- Returns one row: ids to write (new or changed), ids to delete (no longer
-- listed), and how many rows the board has stored now.
drop function if exists public.job_board_diff(text, text, text[], text[]);
create function public.job_board_diff(
  p_source text,
  p_slug text,
  p_ids text[],
  p_hashes text[]
)
returns table (write_ids text[], stale_ids text[], existing_count int)
language sql
stable
security invoker
set search_path = public
as $$
  with incoming as (
    select t.id, t.hash
    from unnest(coalesce(p_ids, '{}'::text[]), coalesce(p_hashes, '{}'::text[])) as t(id, hash)
  ),
  current_rows as (
    select e.id, e.content_hash
    from public.job_postings e
    where e.source = p_source and e.board_slug = p_slug
  )
  select
    coalesce((select array_agg(i.id) from incoming i
              left join current_rows c on c.id = i.id
              where c.id is null or c.content_hash is distinct from i.hash), '{}'::text[]),
    coalesce((select array_agg(c.id) from current_rows c
              where not exists (select 1 from incoming i where i.id = c.id)), '{}'::text[]),
    (select count(*)::int from current_rows)
$$;

revoke all on function public.job_board_diff(text, text, text[], text[]) from public;
revoke execute on function public.job_board_diff(text, text, text[], text[]) from anon, authenticated;
grant execute on function public.job_board_diff(text, text, text[], text[]) to service_role;

-- ─── job_descriptions ───────────────────────────────────────────────────────
-- Descriptions for a search's top results, cut to p_max characters (the
-- ranking reads the first 5000). Saves sending the full 8000 for each job.
drop function if exists public.job_descriptions(text[], int);
create function public.job_descriptions(p_ids text[], p_max int default 5000)
returns table (id text, description_text text)
language sql
stable
security invoker
set search_path = public
as $$
  select j.id, left(j.description_text, least(greatest(coalesce(p_max, 5000), 0), 8000))
  from public.job_postings j
  where j.id = any(coalesce(p_ids, '{}'::text[]))
$$;

revoke all on function public.job_descriptions(text[], int) from public;
grant execute on function public.job_descriptions(text[], int) to authenticated;
revoke execute on function public.job_descriptions(text[], int) from anon;

-- ─── search_job_postings ────────────────────────────────────────────────────
-- The candidate set for one search. The app still ranks and filters the
-- result in JavaScript (sources.ts), so this only has to be generous and fast.
-- The query arguments come from indexQueryParts() in filters.ts:
--   p_query        websearch syntax, e.g. "cashier or retail associate", with
--                  Postgres stop words left out. Empty = no full-text part.
--   p_title_query  only the phrases with no stop words, for title_hit.
--   p_title_res    title regexes for phrases with a stop word. Full-text
--                  search can't see stop words, so "IT" is found this way.
--   p_body_res     stop words that full-text matches must also contain
--                  (in title or description), e.g. "it" for "IT support".
--   p_has_location the user typed a location: keep remote jobs + jobs matching it
--   p_loc_like     ILIKE patterns for the location, e.g. {'%syracuse%','%new york%'}
--   p_loc_regex    regexes for state codes, e.g. {'\mNY\M'}
-- Order: title matches first, then jobs in the typed place, then newest.
-- Dropped first so a re-run can change the arguments or returned columns.
drop function if exists public.search_job_postings(text, boolean, text[], text[], boolean, int);
drop function if exists public.search_job_postings(text, text, text[], text[], boolean, text[], text[], boolean, int);
create function public.search_job_postings(
  p_query text default '',
  p_title_query text default '',
  p_title_res text[] default '{}',
  p_body_res text[] default '{}',
  p_has_location boolean default false,
  p_loc_like text[] default '{}',
  p_loc_regex text[] default '{}',
  p_remote_only boolean default false,
  p_limit int default 1000
)
returns table (
  id text,
  source text,
  board_slug text,
  company text,
  title text,
  location text,
  remote boolean,
  url text,
  apply_url text,
  posted_at timestamptz,
  title_hit boolean,
  is_local boolean,
  -- false when there was no usable query (rows are just the newest)
  query_used boolean
)
language plpgsql
stable
security invoker
set search_path = public
as $$
#variable_conflict use_column
declare
  q tsquery;
  tq tsquery;
  lim int := least(greatest(coalesce(p_limit, 1000), 1), 3000);
  likes text[] := coalesce(p_loc_like, '{}');
  regexes text[] := coalesce(p_loc_regex, '{}');
  title_res text[] := coalesce(p_title_res, '{}');
  body_res text[] := coalesce(p_body_res, '{}');
begin
  if coalesce(btrim(p_query), '') <> '' then
    q := websearch_to_tsquery('english', p_query);
    -- Only stop words left: no lexemes, so no full-text part.
    if numnode(q) = 0 then
      q := null;
    end if;
  end if;
  if coalesce(btrim(p_title_query), '') <> '' then
    tq := websearch_to_tsquery('english', p_title_query);
    if numnode(tq) = 0 then
      tq := null;
    end if;
  end if;

  if q is null and cardinality(title_res) = 0 then
    -- No query: the newest jobs.
    return query
      select j.id, j.source, j.board_slug, j.company, j.title, j.location,
             j.remote, j.url, j.apply_url, j.posted_at,
             false,
             coalesce(p_has_location and (j.location ilike any(likes) or j.location ~ any(regexes)), false),
             false
      from public.job_postings j
      where (not p_remote_only or j.remote)
        and (not p_has_location or j.remote
             or j.location ilike any(likes) or j.location ~ any(regexes))
      order by 12 desc, 10 desc nulls last
      limit lim;
  elsif q is null then
    -- Only stop-word phrases ("IT"): match them in the title.
    return query
      select j.id, j.source, j.board_slug, j.company, j.title, j.location,
             j.remote, j.url, j.apply_url, j.posted_at,
             true,
             coalesce(p_has_location and (j.location ilike any(likes) or j.location ~ any(regexes)), false),
             true
      from public.job_postings j
      where j.title ~* any(title_res)
        and (not p_remote_only or j.remote)
        and (not p_has_location or j.remote
             or j.location ilike any(likes) or j.location ~ any(regexes))
      order by 12 desc, 10 desc nulls last
      limit lim;
  else
    -- Full-text matches (using the GIN index), plus title regex matches for
    -- stop-word phrases.
    return query
      with hits as (
        select x.id
        from public.job_postings x
        where to_tsvector('english'::regconfig, x.title || ' ' || x.company || ' ' || x.description_text) @@ q
          and (cardinality(body_res) = 0
               or (x.title || ' ' || x.description_text) ~* any(body_res))
        union
        select y.id
        from public.job_postings y
        where cardinality(title_res) > 0 and y.title ~* any(title_res)
      )
      select j.id, j.source, j.board_slug, j.company, j.title, j.location,
             j.remote, j.url, j.apply_url, j.posted_at,
             coalesce(to_tsvector('english'::regconfig, j.title) @@ tq, false)
               or j.title ~* any(title_res),
             coalesce(p_has_location and (j.location ilike any(likes) or j.location ~ any(regexes)), false),
             true
      from hits h
      join public.job_postings j on j.id = h.id
      where (not p_remote_only or j.remote)
        and (not p_has_location or j.remote
             or j.location ilike any(likes) or j.location ~ any(regexes))
      order by 11 desc, 12 desc, 10 desc nulls last
      limit lim;
  end if;
end;
$$;

revoke all on function public.search_job_postings(text, text, text[], text[], boolean, text[], text[], boolean, int) from public;
grant execute on function public.search_job_postings(text, text, text[], text[], boolean, text[], text[], boolean, int) to authenticated;
revoke execute on function public.search_job_postings(text, text, text[], text[], boolean, text[], text[], boolean, int) from anon;
