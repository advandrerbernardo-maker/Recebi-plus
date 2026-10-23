-- Agendamento seguro, 09:00-18:00 America/Manaus: tenta enviar uma vez
-- por conta/data; tentativas repetidas são deduplicadas no banco e pelo provedor.
-- O token é criado dentro do Supabase Vault e NUNCA exposto ao navegador.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32),'hex'),
  'recebiplus_cron_token',
  'Token exclusivo para as chamadas agendadas do Recebi+'
)
WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='recebiplus_cron_token');

CREATE OR REPLACE FUNCTION public.recebiplus_validate_cron_token(p_token text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce(length(p_token)>=32 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets s
    WHERE s.name='recebiplus_cron_token' AND s.decrypted_secret=p_token
  ),false);
$$;
REVOKE ALL ON FUNCTION public.recebiplus_validate_cron_token(text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recebiplus_validate_cron_token(text)
  TO service_role;

SELECT cron.schedule(
 'recebiplus_due_email_hourly',
 '0 13-22 * * *',
 $job$
 SELECT net.http_post(
   url:='https://ytdantnjhegdvzwhgjcu.supabase.co/functions/v1/recebiplus-due-emails',
   headers:=jsonb_build_object(
     'Content-Type','application/json',
     'x-recebiplus-cron',(
       SELECT decrypted_secret
       FROM vault.decrypted_secrets
       WHERE name='recebiplus_cron_token'
       LIMIT 1
     )
   ),
   body:='{}'::jsonb,
   timeout_milliseconds:=15000
 );
 $job$
);
