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

## Conectar o remetente (passo obrigatório)

1. Crie uma conta **gratuita** em https://resend.com .
2. Verifique um domínio que você controla no menu **Domains** do Resend (DNS de SPF/DKIM). Escolha uma conta remetente desse domínio, por exemplo \`avisos@SEUDOMINIO.com.br\`. Não use domínios sem permissão de DNS.
3. No **Supabase Dashboard → projeto Recebi-plus → Edge Functions → Secrets**, adicione e salve **sem colar no GitHub ou no chat**:
   - \`RESEND_API_KEY\` = chave criada no Resend.
   - \`RESEND_FROM_EMAIL\` = remetente do domínio verificado, ex. \`Recebi+ <avisos@SEUDOMINIO.com.br>\`.
4. Confirme que a função \`recebiplus-due-emails\` consta como **ACTIVE** em Supabase Edge Functions. O Cron \`recebiplus_due_email_hourly\` já está agendado e o token foi gerado internamente no Supabase Vault; **não é preciso configurar token ou serviço adicional**.
5. Abra o Recebi+, toque **Verificar atualizações**, entre na sua conta e ative **Quero receber avisos de vencimentos no e-mail desta conta**. Toque **Salvar preferência de e-mail**.
6. O campo **Destinatário** exibe o e-mail de login; o status do serviço deve sair de “remetente ainda precisa ser configurado” para “avisos ativados”. Para testar de ponta a ponta, observe na próxima execução às 9h ou consulte o status do cron e o log de mensagens enviadas. Não gere/mande comprovantes falsos.

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
