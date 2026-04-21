-- Add a column to store an AI-generated face description per photo
ALTER TABLE public.media
  ADD COLUMN IF NOT EXISTS face_descriptors jsonb DEFAULT NULL;

-- Index to query faces by event quickly (already indexed by event_id implicitly via FK, just a marker)
CREATE INDEX IF NOT EXISTS idx_media_event_id ON public.media(event_id);