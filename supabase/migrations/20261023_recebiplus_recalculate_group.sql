-- Recebi+ | 2026-10-23 | Recalcular o valor TOTAL de um parcelamento.
-- Executa em uma única transação. Preserva parcelas pagas, datas e descrições.
-- Grava auditoria pelo gatilho existente e rejeita alterações concorrentes.
-- SECURITY INVOKER + auth.uid() + RLS. Não expõe dados entre contas.
CREATE OR REPLACE FUNCTION public.recebiplus_recalculate_group(
    p_client_id uuid,
    p_group_id uuid,
    p_new_total bigint,
    p_expected_versions jsonb
)
RETURNS TABLE (
    charge_id uuid,
    new_cents bigint,
    new_version bigint,
    payment_confirmed boolean
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path=public,pg_temp
AS $function$
DECLARE
    v_owner uuid := auth.uid();
    v_count integer := 0;
    v_pending integer := 0;
    v_paid_total bigint := 0;
    v_remaining bigint;
    v_base bigint;
    v_extra bigint;
    v_index integer := 0;
    v_new_cents bigint;
    v_version_text text;
    row_charge record;
BEGIN
    IF v_owner IS NULL THEN
        RAISE EXCEPTION 'Sessão expirada. Entre novamente.';
    END IF;
    IF p_client_id IS NULL OR p_group_id IS NULL OR p_new_total IS NULL
      OR p_new_total < 1 OR p_new_total > 200000000000 THEN
        RAISE EXCEPTION 'Novo valor total inválido.';
    END IF;
    IF p_expected_versions IS NULL OR jsonb_typeof(p_expected_versions) <> 'object' THEN
        RAISE EXCEPTION 'Versões das parcelas são obrigatórias.';
    END IF;

    -- Serializa inserções no mesmo cliente enquanto recalcula; impede
    -- inserção concorrente de novas parcelas no mesmo grupo.
    PERFORM 1 FROM public.recebiplus_clients c
    WHERE c.id=p_client_id AND c.owner_id=v_owner
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado nesta conta.'; END IF;

    -- Bloqueia TODAS as linhas do grupo, inclusive as pagas.
    FOR row_charge IN
        SELECT c.id,c.version,c.cents,c.paid FROM public.recebiplus_charges c
        WHERE c.owner_id=v_owner AND c.client_id=p_client_id
          AND c.group_id=p_group_id
        ORDER BY c.id
        FOR UPDATE
    LOOP
        v_count:=v_count+1;
        IF v_count>20 THEN
            RAISE EXCEPTION 'Este parcelamento excede o limite de 20 parcelas.';
        END IF;
        v_version_text:=p_expected_versions->>(row_charge.id::text);
        IF v_version_text IS NULL OR v_version_text !~ '^[1-9][0-9]{0,15}$'
            OR v_version_text::bigint <> row_charge.version THEN
            RAISE EXCEPTION 'Cobrança alterada em outro dispositivo. Atualize os dados antes de tentar novamente.';
        END IF;
        IF row_charge.paid THEN
            v_paid_total:=v_paid_total+row_charge.cents;
        ELSE
            v_pending:=v_pending+1;
        END IF;
    END LOOP;

    IF v_count=0 THEN
        RAISE EXCEPTION 'Parcelamento não encontrado nesta conta.';
    END IF;
    IF jsonb_object_length(p_expected_versions) <> v_count THEN
        RAISE EXCEPTION 'Quantidade de parcelas alterada. Atualize antes de continuar.';
    END IF;
    IF v_pending=0 THEN
        RAISE EXCEPTION 'Todas as parcelas estão pagas. Não é possível alterar o histórico de pagamentos.';
    END IF;
    v_remaining:=p_new_total-v_paid_total;
    IF v_remaining<v_pending THEN
        RAISE EXCEPTION 'Novo total insuficiente: mantenha os pagamentos efetuados e pelo menos R$ 0,01 por parcela pendente.';
    END IF;
    v_base:=v_remaining/v_pending;
    v_extra:=v_remaining%v_pending;
    IF v_base<1 OR v_base>10000000000 OR (v_base+v_extra)>10000000000 THEN
        RAISE EXCEPTION 'Valor de uma parcela excede o limite permitido.';
    END IF;

    -- Distribui centavos de forma determinística, deixando o ajuste
    -- dos centavos finais para a última parcela pendente.
    FOR row_charge IN
        SELECT c.id,c.cents,c.version FROM public.recebiplus_charges c
        WHERE c.owner_id=v_owner AND c.client_id=p_client_id
          AND c.group_id=p_group_id AND c.paid=false
        ORDER BY c.due_date,c.description,c.id
        FOR UPDATE
    LOOP
        v_index:=v_index+1;
        v_new_cents:=v_base+CASE WHEN v_index=v_pending THEN v_extra ELSE 0 END;
        IF v_new_cents IS DISTINCT FROM row_charge.cents THEN
            UPDATE public.recebiplus_charges c
            SET cents=v_new_cents
            WHERE c.id=row_charge.id AND c.owner_id=v_owner
              AND c.version=row_charge.version AND c.paid=false;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'Cobrança alterada em outro dispositivo. Atualize os dados.';
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY
    SELECT c.id,c.cents,c.version,c.paid
    FROM public.recebiplus_charges c
    WHERE c.owner_id=v_owner AND c.client_id=p_client_id AND c.group_id=p_group_id
    ORDER BY c.due_date,c.description,c.id;
END
$function$;

REVOKE ALL ON FUNCTION public.recebiplus_recalculate_group(
  uuid,uuid,bigint,jsonb
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recebiplus_recalculate_group(
  uuid,uuid,bigint,jsonb
) TO authenticated;
