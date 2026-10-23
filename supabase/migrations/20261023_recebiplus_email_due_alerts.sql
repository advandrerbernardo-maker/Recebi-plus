-- Recebi+ aviso de vencimentos por email: 2 dias antes e no dia (America/Manaus).
-- Novo módulo. Não altera clientes, cobranças, recibos nem autenticação existente.
-- Os usuários devem habilitar explicitamente; padrão false.
CREATE TABLE IF NOT EXISTS public.recebiplus_email_preferences (
  owner_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.recebiplus_email_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recebiplus_email_preferences FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.recebiplus_email_preferences TO authenticated;
GRANT ALL ON public.recebiplus_email_preferences TO service_role;

CREATE POLICY "Email preferences owner select" ON public.recebiplus_email_preferences
  FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY "Email preferences owner insert" ON public.recebiplus_email_preferences
  FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY "Email preferences owner update" ON public.recebiplus_email_preferences
  FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid()))
  WITH CHECK (owner_id=(SELECT auth.uid()));

-- Registro de envio, não contém e-mail, nome de cliente ou valor.
-- Bloqueio por conta/dia: um resumo diário, mesmo com muitas parcelas.
CREATE TABLE IF NOT EXISTS public.recebiplus_email_runs (
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','skipped')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 4),
  claim_id uuid NOT NULL DEFAULT gen_random_uuid(),
  locked_until timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'),
  provider_message_id text,
  error_code text,
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id,local_date)
);
ALTER TABLE public.recebiplus_email_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recebiplus_email_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recebiplus_email_runs TO service_role;
CREATE INDEX IF NOT EXISTS recebiplus_email_runs_status_idx
  ON public.recebiplus_email_runs(status,locked_until);
CREATE INDEX IF NOT EXISTS recebiplus_due_pending_idx
  ON public.recebiplus_charges(due_date,owner_id) WHERE paid=false;

-- A REST RPC somente pode ser executada por service_role, e respeita
-- as configurações do dono das parcelas; nunca é exposta a clientes.
CREATE OR REPLACE FUNCTION public.recebiplus_claim_daily_emails(p_local_date date)
RETURNS TABLE(owner_id uuid,claim_id uuid)
LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$
WITH eligible AS (
  SELECT p.owner_id
  FROM public.recebiplus_email_preferences p
  LEFT JOIN public.recebiplus_email_runs r
    ON r.owner_id=p.owner_id AND r.local_date=p_local_date
  WHERE p.enabled=true
    AND EXISTS (
      SELECT 1 FROM public.recebiplus_charges c
      WHERE c.owner_id=p.owner_id AND c.paid=false
        AND c.due_date IN (p_local_date,p_local_date+2)
    )
    AND (r.owner_id IS NULL OR
      (r.status IN ('sending','failed')
        AND r.attempts<4 AND r.locked_until<=now()))
  ORDER BY p.owner_id
  LIMIT 100
), claims AS (
  INSERT INTO public.recebiplus_email_runs AS l
    (owner_id,local_date,status,attempts,claim_id,locked_until)
  SELECT e.owner_id,p_local_date,'sending',1,gen_random_uuid(),
         now()+interval '15 minutes'
  FROM eligible e
  ON CONFLICT (owner_id,local_date) DO UPDATE SET
     status='sending',attempts=l.attempts+1,
     claim_id=gen_random_uuid(),locked_until=now()+interval '15 minutes',
     error_code=NULL,updated_at=now()
  WHERE l.status IN ('sending','failed') AND l.attempts<4 AND l.locked_until<=now()
  RETURNING l.owner_id,l.claim_id
)
SELECT claims.owner_id,claims.claim_id FROM claims;
$$;
REVOKE ALL ON FUNCTION public.recebiplus_claim_daily_emails(date)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recebiplus_claim_daily_emails(date) TO service_role;

CREATE OR REPLACE FUNCTION public.recebiplus_finish_daily_email(
  p_owner uuid,
  p_local_date date,
  p_claim uuid,
  p_status text,
  p_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
  IF p_status NOT IN ('sent','failed','skipped') THEN
    RAISE EXCEPTION 'Invalid email status';
  END IF;
  UPDATE public.recebiplus_email_runs AS l SET
    status=p_status,
    provider_message_id=LEFT(p_message_id,255),
    error_code=LEFT(p_error_code,100),
    sent_at=CASE WHEN p_status='sent' THEN now() ELSE NULL END,
    locked_until=CASE WHEN p_status='failed'
      THEN now()+interval '45 minutes' ELSE now()+interval '100 years' END,
    updated_at=now()
  WHERE l.owner_id=p_owner AND l.local_date=p_local_date
    AND l.claim_id=p_claim AND l.status='sending';
  GET DIAGNOSTICS n=ROW_COUNT;
  RETURN n=1;
END;
$$;
REVOKE ALL ON FUNCTION public.recebiplus_finish_daily_email(
  uuid,date,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recebiplus_finish_daily_email(
  uuid,date,uuid,text,text,text) TO service_role;
