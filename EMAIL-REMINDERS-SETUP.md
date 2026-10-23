# Recebi+ — Avisos automáticos por e-mail (2026-10-23)

## Estado técnico

**Infraestrutura preparada e implantada**. Para testar o envio apenas para o próprio e-mail da conta Resend, basta cadastrar o segredo \`RESEND_API_KEY\` no Supabase. O remetente temporário será \`Recebi+ <onboarding@resend.dev>\`. Não use o remetente de teste para usuários diferentes do titular Resend. Para ativação definitiva e outros destinatários, verifique domínio próprio e cadastre também \`RESEND_FROM_EMAIL\`. Sem chave, nenhum e-mail é enviado.

## Confirmação do fluxo definitivo (23/10/2026)

- O e-mail de teste já foi recebido pela conta cadastrada antes desta mudança. A rota de envio manual de teste foi removida após a confirmação, para evitar mensagens fora dos dias elegíveis.
- Só serão enviados resumos de cobranças nos dias certos: exatamente **D-2** e **D0**, às **09:00** de Manaus, no máximo uma vez por dia para cada conta.
- Se não existir parcela pendente com vencimento hoje ou daqui a 2 dias, **nenhum e-mail será enviado**.
- Outras notificações do aplicativo (no dispositivo) não foram alteradas.
- A integração Resend permanece no modo de teste `onboarding@resend.dev`, para o e-mail proprietário da conta Resend. Para atender outros destinatários, verifique um domínio próprio e configure RESEND_FROM_EMAIL.
- Backup antes desta configuração: `backup-antes-email-unico-0900-20261023`.

## Comportamento confirmado

- Somente para contas que ativarem **Avisos por e-mail** na tela de login do Recebi+.
- Destino: endereço **atual** obtido em \`auth.admin.getUserById(owner_id).data.user.email\` no momento do envio, com email confirmado. Nunca usa e-mail digitado pelo cliente.
- Somente **um e-mail por conta e por dia**, caso existam parcelas **PENDENTES** vencendo **hoje** ou **exatamente em 2 dias**. Não envia em outras datas nem por parcelas atrasadas ou pagas.
- **Uma única execução diária às 09:00 em Manaus** (13:00 GMT; `cron.timezone` deste projeto é GMT). **Não existem retentativas no mesmo dia**: se o envio falhar, não haverá outro e-mail nesse dia.
- **Pago:** não é incluído; a cobrança é reconsultada antes do envio.
- O corpo do e-mail apresenta **Nome do cliente** e **Valor da parcela**, organizados em `Vencem hoje` e `Vencem em 2 dias`. A data aparece no título de cada grupo. Descrições não são incluídas; não envia mensagens aos clientes cadastrados.
- Mesmo dia/conta: `PRIMARY KEY(owner_id,local_date)`, `ON CONFLICT DO NOTHING` e `Idempotency-Key` estável no Resend impedem solicitações repetidas. Acesso administrativo restrito ao service_role.
- Sem abrir o aplicativo. Sem misturar usuários ou revelar senha/CPF.
- Os avisos no tablet/celular e a emissão de recibo continuam independentes.

## Primeiro teste: sem domínio próprio

1. Acesse o projeto Supabase → Edge Functions → Secrets: https://supabase.com/dashboard/project/ytdantnjhegdvzwhgjcu/settings/functions
2. Adicione **somente** a variável `RESEND_API_KEY`, inserindo a chave completa pelo painel do Supabase. **Nunca envie o segredo para o chat ou GitHub.**
3. O remetente temporário será `Recebi+ <onboarding@resend.dev>`. Por restrição do Resend, ele funciona exclusivamente para o próprio e-mail cadastrado na conta Resend. Não serve para terceiros nem para operação definitiva com usuários de outras contas.
4. A função `recebiplus-due-emails` deve estar ACTIVE. O cron `recebiplus_due_email_0900_manaus` executa **somente às 09:00 de Manaus**, todos os dias, mas só envia uma mensagem se houver parcelas pendentes com vencimento hoje ou exatamente em dois dias.
5. O app exibe 'Modo de teste habilitado' quando reconhece a chave. Esse status **não prova** entrega; confirme o envio no painel do Resend e na caixa do destinatário.

## Produção: domínio verificado

1. Em Resend → Domains, cadastre o domínio que você controla e confirme os registros DNS de SPF/DKIM.
2. No Supabase → Edge Functions → Secrets, mantenha `RESEND_API_KEY` e acrescente `RESEND_FROM_EMAIL` com remetente no domínio verificado, por exemplo `Recebi+ <avisos@SEUDOMINIO.com.br>`.
3. A função troca automaticamente do remetente de teste para o personalizado e passa a atender os demais titulares das contas que optaram pelos avisos.
4. Não há necessidade de plano pago obrigatório nem de alteração no cadastro dos clientes.

**Limite do Resend Free:** até 3.000 e-mails/mês e 100/dia (verifique os termos atuais em https://resend.com/pricing).

## Onde os arquivos estão

- \`index.html\` e \`app-version.json\`: tela e status para o assinante.
- \`supabase/functions/recebiplus-due-emails/index.ts\`: envio automático, autorização do cron e consultoria do destinatário.
- \`supabase/migrations/20261023_recebiplus_email_due_alerts.sql\`: RLS, opt-in, controle de envios idempotentes.
- `supabase/migrations/20261023_recebiplus_email_cron.sql`: configuração histórica de agendamento e chave Vault.
- `supabase/migrations/20261023_recebiplus_email_0900_once_daily.sql`: cron definitivo único às 09:00 e proteção contra envio repetido.
- \`recebiplus-tests/avisos-email.node.test.mjs\`: testes automatizados sem e-mail real.

## Segurança, restauração e resolução de problemas

- Backup pré-recurso do GitHub: branch \`backup-antes-avisos-email-20261023\` (commit \`a5dd92aa2b7efddcfaaeca558580d5c3cb22dccd\`).
- A opção é **desativada por padrão**, inclusive para outras contas do aplicativo: exige consentimento dentro de cada conta.
- Para desativar já: desmarque a opção no aplicativo e salve. Alternativamente, no Supabase **Cron** pause \`recebiplus_due_email_hourly\` (interrompe todos os avisos). A função consulta novamente o opt-in antes do envio.
- As funções de reivindicar e concluir envio são **apenas para service_role**, sem grants para usuários ou \`anon\`. Tokens não são armazenados no GitHub.
- Para desfazer somente a interface, restaure \`index.html\` / \`app-version.json\` via backup. Para desativar totalmente o agendamento, desative o job antes de remover função/tabelas; não exclua outras tabelas de clientes e cobrança.
- Por segurança, os dados dos clientes não são colocados na tabela de logs; apenas status e IDs.
- Possíveis falhas: limite diário Resend, remetente não verificado, e-mail não confirmado, servidor indisponível, mensagens na caixa de spam. A Edge Function informa status ou registra códigos de erro sem dados pessoais.
- **Importante:** as entregas não foram testadas em uma caixa de entrada real até a configuração das credenciais e da conta remetente.
