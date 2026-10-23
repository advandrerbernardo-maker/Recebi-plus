-- Recebi+ | agenda definitiva em America/Manaus: às 09:00, uma vez ao dia.
-- pg_cron está em GMT neste projeto; 13:00 GMT = 09:00 em Manaus.
-- Só existem notificações para cobranças PENDENTES com vencimento no dia
-- corrente ou exatamente 2 dias depois; não reenvia fora dessas datas.
-- A mudança substitui o agendamento anterior que repetia até 18:00.

SELECT cron.unschedule('recebiplus_due_email_hourly');

SELECT cron.schedule(
 'recebiplus_due_email_0900_manaus',
 '0 13 * * *',
 $job$
 SELECT net.http_post(
   url:='https://ytdantnjhegdvzwhgjcu.supabase.co/functions/v1/recebiplus-due-emails',
   headers:=jsonb_build_object(
     'Content-Type','application/json',
     'x-recebiplus-cron',(
       SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name='recebiplus_cron_token'
       LIMIT 1
     )
   ),
   body:='{}'::jsonb,
   timeout_milliseconds:=15000
 );
 $job$
);

-- O relógio do banco dispara uma vez e cada proprietário pode receber,
-- no máximo, uma tentativa de resumo por data local, mesmo se houver
-- chamadas manuais ou repetidas. Nenhum retry no mesmo dia.
CREATE OR REPLACE FUNCTION public.recebiplus_claim_daily_emails(p_local_date date)
RETURNS TABLE(owner_id uuid,claim_id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
WITH eligible AS (
  SELECT p.owner_id
  FROM public.recebiplus_email_preferences p
  WHERE p.enabled=true
    AND EXISTS (
      SELECT 1 FROM public.recebiplus_charges c
      WHERE c.owner_id=p.owner_id AND c.paid=false
        AND c.due_date IN (p_local_date,p_local_date+2)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.recebiplus_email_runs r
      WHERE r.owner_id=p.owner_id AND r.local_date=p_local_date
    )
  ORDER BY p.owner_id
  LIMIT 100
), claims AS (
  INSERT INTO public.recebiplus_email_runs AS l
    (owner_id,local_date,status,attempts,claim_id,locked_until)
  SELECT e.owner_id,p_local_date,'sending',1,gen_random_uuid(),
         now()+interval '15 minutes'
  FROM eligible e
  ON CONFLICT (owner_id,local_date) DO NOTHING
  RETURNING l.owner_id,l.claim_id
)
SELECT claims.owner_id,claims.claim_id FROM claims;
$function$;

REVOKE ALL ON FUNCTION public.recebiplus_claim_daily_emails(date)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recebiplus_claim_daily_emails(date) TO service_role;
