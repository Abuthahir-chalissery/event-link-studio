-- Drop broken/duplicate storage policies and recreate correct ones
DROP POLICY IF EXISTS "Owners upload to own events" ON storage.objects;
DROP POLICY IF EXISTS "Owners update own event media" ON storage.objects;
DROP POLICY IF EXISTS "Owners delete own event media" ON storage.objects;
DROP POLICY IF EXISTS "Public read individual event media" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload event media" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update event media" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete event media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read event media" ON storage.objects;

-- Correct policies: use storage.objects.name (the file path)
CREATE POLICY "event_media_insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
      AND e.owner_id = auth.uid()
  )
);

CREATE POLICY "event_media_update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
      AND e.owner_id = auth.uid()
  )
);

CREATE POLICY "event_media_delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'event-media'
  AND EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.id::text = (storage.foldername(storage.objects.name))[1]
      AND e.owner_id = auth.uid()
  )
);

CREATE POLICY "event_media_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'event-media');

-- Add cascade delete: when an event is deleted, its media rows go too
ALTER TABLE public.media
  DROP CONSTRAINT IF EXISTS media_event_id_fkey;
ALTER TABLE public.media
  ADD CONSTRAINT media_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS favorites_event_id_fkey;
ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_event_id_fkey
  FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE;

ALTER TABLE public.favorites
  DROP CONSTRAINT IF EXISTS favorites_media_id_fkey;
ALTER TABLE public.favorites
  ADD CONSTRAINT favorites_media_id_fkey
  FOREIGN KEY (media_id) REFERENCES public.media(id) ON DELETE CASCADE;