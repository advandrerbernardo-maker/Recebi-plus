# Recebi+ — Editar valores (versão 23)

## Uso
1. Abra um cliente com parcelas pendentes.
2. Ao lado de Valor total, toque em ✎ Editar valor.
3. Se o cliente tiver mais de um parcelamento, escolha qual deles alterar.
4. Digite o novo valor. A máscara brasileira formata os dígitos automaticamente: 123456 aparece como R$ 1.234,56.
5. Confira o valor pago, o saldo e a nova distribuição, depois confirme.

## Regras de cálculo
- As parcelas PAGO e os recibos já emitidos permanecem inalterados.
- O novo saldo é redistribuído somente entre parcelas PENDENTES do plano selecionado.
- Datas, descrições, clientes e outros planos não mudam.
- O ajuste de centavos é incorporado à última parcela pendente.
- A atualização ocorre em uma transação PostgreSQL, com auditoria, isolamento por conta e versões de concorrência.
- Se a conexão falhar durante a confirmação, atualize os dados antes de repetir.
- O total novo não pode ser inferior ao montante já pago mais um centavo por parcela pendente.

Exemplo: plano de R$ 2.500 em 5x R$ 500, primeira já paga. Novo total R$ 3.000 => primeira permanece R$ 500, quatro pendentes passam a R$ 625 cada.

## Arquivos
- index.html: botão e diálogo.
- recebiplus-supabase/money.js: máscara monetária e prévia.
- recebiplus-supabase/edit-total.js: lógica do diálogo e confirmação.
- recebiplus-supabase/repository.js: chamada RPC.
- supabase/migrations/20261023_recebiplus_recalculate_group.sql: transação e proteção de pagamentos.
- recebiplus-tests/edicao-valores.node.test.mjs: testes automáticos.

## Reversão
Backup anterior à alteração: branch backup-antes-editar-valores-20261023, commit a5dd92aa2b7efddcfaaeca558580d5c3cb22dccd.
É possível restaurar os arquivos principais do GitHub usando essa branch. A função SQL também pode ser desabilitada separadamente.
Observação: restaurar o código não desfaz alterações monetárias que o usuário já confirmou. Valores anteriores ficam disponíveis no histórico de auditoria do banco.

Validação: testes reais do banco executados em transação com ROLLBACK, sem dados de teste persistidos.
