-- =====================================================================
-- Freedom Wall: PATCH 02, reply-to numbers + picture posts
-- Run ONCE in the Supabase SQL Editor, AFTER patch-01.
--
-- What changes:
--   * Posts can say "Replying to #FW0042" (a link to an earlier post).
--   * Posts can carry ONE picture. Pictures are saved in a private
--     storage bucket. A message WITH a picture waits in "review" until an
--     admin approves it. Text-only messages still go straight to the queue.
--   * Admins get two new actions: approve or reject a picture post.
--
-- New status flow for picture posts:
--   review -> queued -> posting -> posted      (approved)
--   review -> rejected                         (rejected, picture deleted)
--
-- NOTE: if the "storage.buckets" insert below errors, create the bucket by
-- hand instead (Storage > New bucket, name: wall-images, keep it PRIVATE,
-- allowed type image/jpeg) and run the rest of the file again.
-- =====================================================================


-- ---------- 1. New columns -------------------------------------------
-- The post number this message is replying to.
alter table public.submissions
  add column if not exists reply_to integer
  references public.submissions(post_number) on delete set null;

-- File name of the picture inside the storage bucket (null = no picture).
alter table public.submissions add column if not exists image_path text;


-- ---------- 2. Rules: allow picture-only posts, add new statuses -----
alter table public.submissions drop constraint submissions_message_check;
alter table public.submissions add constraint submissions_message_check
  check (
    char_length(btrim(message)) <= 2000
    and (char_length(btrim(message)) >= 1 or image_path is not null)
  );

alter table public.submissions drop constraint submissions_status_check;
alter table public.submissions add constraint submissions_status_check
  check (status in ('review', 'queued', 'posting', 'posted', 'failed', 'removed', 'rejected'));


-- ---------- 3. Duplicate check now also looks at the picture ---------
-- (So two picture-only posts don't count as "the same message".)
create or replace function public.prepare_submission() returns trigger
language plpgsql as $$
begin
  new.message_hash := md5(
    lower(regexp_replace(btrim(new.message), '\s+', ' ', 'g'))
    || coalesce(new.image_path, '')
  );

  if exists (
    select 1 from public.submissions s
    where s.message_hash = new.message_hash
      and s.created_at > now() - interval '30 days'
  ) then
    new.flags := array_append(new.flags, 'duplicate');
  end if;

  return new;
end $$;


-- ---------- 4. Admin actions for picture posts -----------------------
-- review -> queued
create or replace function public.approve_image_post(p_id uuid)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  perform public.require_admin();

  update public.submissions
     set status            = 'queued',
         reviewed_by       = auth.uid(),
         reviewed_by_email = auth.jwt() ->> 'email',
         reviewed_at       = now()
   where id = p_id and status = 'review'
  returning * into r;

  if not found then
    raise exception 'submission is not waiting for review' using errcode = 'P0002';
  end if;
  return r;
end $$;

-- review -> rejected (the app deletes the picture file afterwards)
create or replace function public.reject_image_post(p_id uuid, p_reason text default null)
returns public.submissions
language plpgsql security definer set search_path = public as $$
declare r public.submissions;
begin
  perform public.require_admin();

  update public.submissions
     set status            = 'rejected',
         rejection_reason  = nullif(btrim(p_reason), ''),
         reviewed_by       = auth.uid(),
         reviewed_by_email = auth.jwt() ->> 'email',
         reviewed_at       = now()
   where id = p_id and status = 'review'
  returning * into r;

  if not found then
    raise exception 'submission is not waiting for review' using errcode = 'P0002';
  end if;
  return r;
end $$;

revoke execute on function
  public.approve_image_post(uuid),
  public.reject_image_post(uuid, text)
from public, anon, authenticated;

grant execute on function
  public.approve_image_post(uuid),
  public.reject_image_post(uuid, text)
to authenticated;


-- ---------- 5. Private bucket for pictures ---------------------------
-- Students never touch this bucket. Our server saves pictures into it with
-- the secret key. Only admins can look at (or delete) files, through
-- short-lived signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall-images', 'wall-images', false, 5242880, array['image/jpeg'])
on conflict (id) do nothing;

create policy "admins read wall images"
  on storage.objects for select to authenticated
  using (bucket_id = 'wall-images' and public.is_admin());

create policy "admins delete wall images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'wall-images' and public.is_admin());
