-- =====================================================================
-- Freedom Wall: PATCH 01, zero review + posting queue
-- Run this ONCE in the Supabase SQL Editor, AFTER schema.sql.
--
-- What changes:
--   * No more approve/reject. New messages go straight into a queue.
--   * A small job (called every minute) takes the oldest queued message
--     and posts it to Facebook, but only if 5 minutes have passed since
--     the last one. The database enforces that gap, so calling the job
--     too often can't beat it.
--   * Admins can still: see everything, retry failed posts, and take a
--     live post down.
--
-- New status flow:
--   queued -> posting -> posted -> (removed)
--                     \-> failed -> (retry) -> queued
--
-- If this errors on the "status_check" line, you have test rows with an
-- old status like 'rejected'. Delete them (or ask me) and run it again.
-- =====================================================================


-- ---------- 1. New statuses ------------------------------------------
alter table public.submissions drop constraint submissions_status_check;

update public.submissions set status = 'queued'
 where status in ('pending', 'approved');

alter table public.submissions add constraint submissions_status_check
  check (status in ('queued', 'posting', 'posted', 'failed', 'removed'));

alter table public.submissions alter column status set default 'queued';

-- When the posting job picked this message up (used for the spacing rule).
alter table public.submissions add column if not exists claimed_at timestamptz;


-- ---------- 2. Remove the approve/reject functions -------------------
drop function if exists public.approve_submission(uuid);
drop function if exists public.reject_submission(uuid, text);
drop function if exists public.mark_posted(uuid, text);
drop function if exists public.mark_failed(uuid, text);


-- ---------- 3. The posting job's functions ---------------------------
-- These are only callable with the server's secret key (service_role).
-- Students and admins in the browser cannot call them.

-- Picks the next message to post, if it's allowed to post one right now.
-- Returns zero rows when there's nothing to do.
create or replace function public.claim_next_post()
returns setof public.submissions
language plpgsql security definer set search_path = public as $$
declare
  gap        integer;
  last_claim timestamptz;
  r          public.submissions;
begin
  -- Only one caller at a time gets past this line, so two overlapping job
  -- runs can never grab two messages.
  perform pg_advisory_xact_lock(hashtext('freedom_wall_claim'));

  -- Stuck "posting" for 10+ minutes means the server died mid-post and we
  -- can't know if Facebook received it. Mark it failed with a warning
  -- instead of blocking the whole line.
  update public.submissions
     set status = 'failed',
         post_error = 'Result unknown (the server stopped mid-post). Check the Page before retrying, it may already be up.'
   where status = 'posting'
     and claimed_at < now() - interval '10 minutes';

  -- Someone is still mid-post: wait.
  if exists (select 1 from public.submissions where status = 'posting') then
    return;
  end if;

  -- Enforce the minimum gap between posts.
  select min_seconds_between_posts into gap from public.settings;
  select max(claimed_at) into last_claim from public.submissions;

  if last_claim is not null
     and last_claim > now() - make_interval(secs => gap) then
    return;
  end if;

  -- Take the oldest queued message. The post number is assigned here (and
  -- kept if the message is retried), so numbers follow posting order.
  update public.submissions
     set status      = 'posting',
         claimed_at  = now(),
         post_number = coalesce(post_number, nextval('public.post_number_seq')),
         post_error  = null
   where id = (
           select id from public.submissions
            where status = 'queued'
            order by created_at
            limit 1
         )
  returning * into r;

  if found then
    return next r;
  end if;
  return;
end $$;

-- Facebook accepted the post.
-- (Also accepts 'failed' in case the 10-minute timeout above fired just
-- before the success came back.)
create or replace function public.finish_post(p_id uuid, p_fb_post_id text)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  update public.submissions
     set status = 'posted', fb_post_id = p_fb_post_id,
         posted_at = now(), post_error = null
   where id = p_id and status in ('posting', 'failed')
  returning * into r;

  if not found then
    raise exception 'submission is not in the posting state' using errcode = 'P0002';
  end if;
  return r;
end $$;

-- Facebook refused it, or we couldn't reach Facebook.
create or replace function public.fail_post(p_id uuid, p_error text)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  update public.submissions
     set status = 'failed', post_error = left(p_error, 1000)
   where id = p_id and status = 'posting'
  returning * into r;

  if not found then
    raise exception 'submission is not in the posting state' using errcode = 'P0002';
  end if;
  return r;
end $$;


-- ---------- 4. Admin retry: failed -> back in the queue --------------
-- Only for posts that never got a Facebook ID, so a live post can't be
-- posted a second time by accident. Keeps its post number.
create or replace function public.retry_submission(p_id uuid)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  perform public.require_admin();

  update public.submissions
     set status = 'queued', post_error = null
   where id = p_id and status = 'failed' and fb_post_id is null
  returning * into r;

  if not found then
    raise exception 'submission is not in the failed state' using errcode = 'P0002';
  end if;
  return r;
end $$;


-- ---------- 5. Who can call what -------------------------------------
-- New functions get broad default access in Supabase, so lock them down.
revoke execute on function
  public.claim_next_post(),
  public.finish_post(uuid, text),
  public.fail_post(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.claim_next_post(),
  public.finish_post(uuid, text),
  public.fail_post(uuid, text)
to service_role;

-- (retry_submission and mark_removed keep their existing admin-only access.)


-- ---------- 6. Your choice: 5 minutes between posts ------------------
update public.settings set min_seconds_between_posts = 300;
