CREATE TABLE public.rate_limit_hits (
  key text NOT NULL CHECK (char_length(key) <= 200),
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);
GRANT ALL ON public.rate_limit_hits TO service_role;
ALTER TABLE public.rate_limit_hits ENABLE ROW LEVEL SECURITY;
-- No policies: only the server (service role) touches this table.

CREATE OR REPLACE FUNCTION public.flux_rate_limit_hit(_key text, _max integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ws timestamptz := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);
  c integer;
BEGIN
  IF _max < 1 OR _window_seconds < 1 OR char_length(_key) > 200 THEN
    RAISE EXCEPTION 'invalid rate limit arguments';
  END IF;
  INSERT INTO public.rate_limit_hits AS r (key, window_start, count)
  VALUES (_key, ws, 1)
  ON CONFLICT (key, window_start) DO UPDATE SET count = r.count + 1
  RETURNING r.count INTO c;
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limit_hits WHERE window_start < now() - interval '1 day';
  END IF;
  RETURN c <= _max;
END;
$$;
REVOKE ALL ON FUNCTION public.flux_rate_limit_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flux_rate_limit_hit(text, integer, integer) TO service_role;