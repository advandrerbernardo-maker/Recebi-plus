# Recebi+ — Avisos automáticos por e-mail (2026-10-23)

## Estado técnico

**Infraestrutura preparada e implantada**. Para testar o envio apenas para o próprio e-mail da conta Resend, basta cadastrar o segredo \`RESEND_API_KEY\` no Supabase. O remetente temporário será \`Recebi+ <onboarding@resend.dev>\`. Não use o remetente de teste para usuários diferentes do titular Resend. Para ativação definitiva e outros destinatários, verifique domínio próprio e cadastre também \`RESEND_FROM_EMAIL\`. Sem chave, nenhum e-mail é enviado.

## Comportamento confirmado

- Somente para contas que ativarem **Avisos por e-mail** na tela de login do Recebi+.
- Destino: endereço **atual** obtido em \`auth.admin.getUserById(owner_id).data.user.email\` no momento do envio, com email confirmado. Nunca usa e-mail digitado pelo cliente.
- Um resumo por dono por dia: parcelas **PENDENTES** vencendo **hoje** ou **em dois dias**, horário de Manaus.
- Começa às 09:00 Manaus; cron tenta novamente a cada hora até 18:00 local em caso de falhas, no máximo quatro tentativas por proprietário/data.
- **Pago:** não é incluído; a cobrança é reconsultada antes do envio.
- Formatação: cliente, descrição, valor e vencimento; não envia mensagens aos clientes cadastrados.
- Mesmo dia/conta: chave única no banco, \`Idempotency-Key\` estável do Resend. Acesso administrativo restrito a service_role.
- Sem abrir o aplicativo. Sem misturar usuários ou revelar senha/CPF.
- Os avisos no tablet/celular e a emissão de recibo continuam independentes.

## Primeiro teste: sem domínio próprio

1. Acesse o projeto Supabase → Edge Functions → Secrets: https://supabase.com/dashboard/project/ytdantnjhegdvzwhgjcu/settings/functions
2. Adicione **somente** a variável `RESEND_API_KEY`, inserindo a chave completa pelo painel do Supabase. **Nunca envie o segredo para o chat ou GitHub.**
3. O remetente temporário será `Recebi+ <onboarding@resend.dev>`. Por restrição do Resend, ele funciona exclusivamente para o próprio e-mail cadastrado na conta Resend. Não serve para terceiros nem para operação definitiva com usuários de outras contas.
4. A função `recebiplus-due-emails` deve estar ACTIVE. O cron e o segredo de agendamento já existem no Supabase. Com a conta de destino habilitada para e-mail, ele tentará enviar o resumo a partir das 09:00, apenas se houver cobranças pendentes vencendo hoje ou em 2 dias.
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
- \`supabase/migrations/20261023_recebiplus_email_cron.sql\`: agendamento e chave Vault.
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
