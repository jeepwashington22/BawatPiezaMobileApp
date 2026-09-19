-- ============================================================
-- BawatPieza - "avatars" storage bucket policies
-- Run this in: Supabase Dashboard > SQL Editor > New query
-- ============================================================
-- The bucket itself (public, 5 MB, images only) is created via the Storage
-- API. These policies let signed-in users manage ONLY their own folder
-- (avatars/<uid>/...) and let anyone read the public pictures.
--
-- VERIFY
--   After running, upload a picture from the app: Profile > tap the avatar.
--   A user must be able to overwrite their own avatar but NOT another
--   user's (the second insert below must fail):
--     insert into storage.objects (bucket_id, name) values ('avatars', 'SOMEONE_ELSES_UID/avatar.jpg');
-- ============================================================

-- Public read (bucket is public; this also covers listing via the API).
create policy "avatars public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Signed-in users may upload only into their own folder.
create policy "avatars insert own folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Signed-in users may replace their own picture (avatar.<ext> is upserted).
create policy "avatars update own folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Signed-in users may remove their own picture (e.g. clearing metadata).
create policy "avatars delete own folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );