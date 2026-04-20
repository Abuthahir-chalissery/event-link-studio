
-- Recreate functions with locked search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_event_password(_event_id UUID, _password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
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

CREATE OR REPLACE FUNCTION public.verify_event_password(_share_slug TEXT, _password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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

-- Tighten favorites policies: ensure media belongs to event
DROP POLICY IF EXISTS "Anyone can add favorites" ON public.favorites;
DROP POLICY IF EXISTS "Anyone can remove favorites" ON public.favorites;

CREATE POLICY "Add favorite for valid media"
  ON public.favorites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.media m
      WHERE m.id = favorites.media_id
      AND m.event_id = favorites.event_id
    )
    AND length(client_token) BETWEEN 8 AND 128
  );

CREATE POLICY "Remove favorite by token"
  ON public.favorites FOR DELETE
  USING (length(client_token) BETWEEN 8 AND 128);

-- Tighten storage select: paths are unguessable, but we restrict SELECT to objects with proper folder structure
DROP POLICY IF EXISTS "Public read event media" ON storage.objects;

CREATE POLICY "Public read individual event media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'event-media'
    AND name IS NOT NULL
    AND array_length(string_to_array(name, '/'), 1) >= 2
  );
