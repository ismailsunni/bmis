-- BMIS 007 — private storage buckets.
-- Nothing here is public: files are served through 60-second signed URLs
-- generated on demand by the client (see src/lib/storage.ts).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('donation-proofs',     'donation-proofs',     false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('beneficiary-docs',    'beneficiary-docs',    false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf']),
  ('distribution-proofs', 'distribution-proofs', false, 10485760,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- Uploads land under <bucket>/<uid>/<filename>, so an amil can only write into
-- their own prefix; reads are open to any role that can write or audit.
create policy storage_bmis_read on storage.objects for select to authenticated
  using (bucket_id in ('donation-proofs','beneficiary-docs','distribution-proofs')
         and public.has_min_role('amil'));

create policy storage_bmis_insert on storage.objects for insert to authenticated
  with check (bucket_id in ('donation-proofs','beneficiary-docs','distribution-proofs')
              and public.can_write()
              and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_bmis_update on storage.objects for update to authenticated
  using (bucket_id in ('donation-proofs','beneficiary-docs','distribution-proofs')
         and public.can_write()
         and (storage.foldername(name))[1] = auth.uid()::text);

create policy storage_bmis_delete on storage.objects for delete to authenticated
  using (bucket_id in ('donation-proofs','beneficiary-docs','distribution-proofs')
         and public.is_super_admin());
