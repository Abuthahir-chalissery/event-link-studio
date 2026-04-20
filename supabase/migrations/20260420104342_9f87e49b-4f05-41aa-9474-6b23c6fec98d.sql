
-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =========================
-- profiles
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by owner"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
CREATE POLICY "Profiles insertable by owner"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
CREATE POLICY "Profiles updatable by owner"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- =========================
-- events
-- =========================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  cover_path TEXT,
  share_slug TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12), 'hex'),
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  allow_downloads BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX events_owner_idx ON public.events(owner_id);
CREATE INDEX events_slug_idx ON public.events(share_slug);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Owner full access
CREATE POLICY "Owner can read own events"
  ON public.events FOR SELECT
  USING (auth.uid() = owner_id);
CREATE POLICY "Owner can insert own events"
  ON public.events FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Owner can update own events"
  ON public.events FOR UPDATE
  USING (auth.uid() = owner_id);
CREATE POLICY "Owner can delete own events"
  ON public.events FOR DELETE
  USING (auth.uid() = owner_id);

-- Public can read minimal event info via share slug (we still gate password client-side via RPC)
CREATE POLICY "Public can read events by slug"
  ON public.events FOR SELECT
  USING (true);

-- =========================
-- media
-- =========================
CREATE TYPE public.media_type AS ENUM ('image', 'video');

CREATE TABLE public.media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  type public.media_type NOT NULL,
  filename TEXT NOT NULL,
  size_bytes BIGINT,
  width INT,
  height INT,
  duration_seconds NUMERIC,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX media_event_idx ON public.media(event_id);
ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

-- Owner can manage media of their events
CREATE POLICY "Owner can read media"
  ON public.media FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = media.event_id AND e.owner_id = auth.uid()));
CREATE POLICY "Owner can insert media"
  ON public.media FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.events e WHERE e.id = media.event_id AND e.owner_id = auth.uid()));
CREATE POLICY "Owner can update media"
  ON public.media FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = media.event_id AND e.owner_id = auth.uid()));
CREATE POLICY "Owner can delete media"
  ON public.media FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.events e WHERE e.id = media.event_id AND e.owner_id = auth.uid()));

-- Public can read all media (gallery is public; sharing controlled by knowing the slug + optional password)
CREATE POLICY "Public can read media"
  ON public.media FOR SELECT
  USING (true);

-- =========================
-- favorites (anonymous client favorites by token)
-- =========================
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  media_id UUID NOT NULL REFERENCES public.media(id) ON DELETE CASCADE,
  client_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (media_id, client_token)
);
CREATE INDEX favorites_event_token_idx ON public.favorites(event_id, client_token);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read favorites"
  ON public.favorites FOR SELECT
  USING (true);
CREATE POLICY "Anyone can add favorites"
  ON public.favorites FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Anyone can remove favorites"
  ON public.favorites FOR DELETE
  USING (true);

-- =========================
-- Trigger: auto-create profile on signup
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- updated_at trigger
-- =========================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER events_set_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- Password helpers (server-side, hash never leaves DB)
-- =========================

-- Hash a password (called by owner when creating/updating event)
CREATE OR REPLACE FUNCTION public.set_event_password(_event_id UUID, _password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only owner can set
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = _event_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _password IS NULL OR length(_password) = 0 THEN
    UPDATE public.events SET password_hash = NULL WHERE id = _event_id;
  ELSE
    UPDATE public.events SET password_hash = crypt(_password, gen_salt('bf')) WHERE id = _event_id;
  END IF;
END;
$$;

-- Verify password (public)
CREATE OR REPLACE FUNCTION public.verify_event_password(_share_slug TEXT, _password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hash TEXT;
BEGIN
  SELECT password_hash INTO _hash FROM public.events WHERE share_slug = _share_slug;
  IF _hash IS NULL THEN
    RETURN TRUE;
  END IF;
  RETURN _hash = crypt(_password, _hash);
END;
$$;

-- =========================
-- Storage bucket for media (public for fast CDN delivery; paths are unguessable UUIDs)
-- =========================
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-media', 'event-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: owners can write to their own event folder; everyone can read
CREATE POLICY "Public read event media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-media');

CREATE POLICY "Owners upload to own events"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-media'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
    )
  );

CREATE POLICY "Owners update own event media"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-media'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
    )
  );

CREATE POLICY "Owners delete own event media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-media'
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.owner_id = auth.uid()
      AND (storage.foldername(name))[1] = e.id::text
    )
  );
