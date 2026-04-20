-- Storage policies for event-media bucket
-- Allow event owners to upload/update/delete files inside their event folder (path starts with event_id)
CREATE POLICY "Owners can upload event media"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[1]
      AND e.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can update event media"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[1]
      AND e.owner_id = auth.uid()
  )
);

CREATE POLICY "Owners can delete event media"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(name))[1]
      AND e.owner_id = auth.uid()
  )
);

-- Public can read (bucket is public, but ensure SELECT policy exists)
CREATE POLICY "Public can read event media"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-media');