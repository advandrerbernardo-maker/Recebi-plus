# Integração experimental Recebi+ ↔ Daiz-e (23/10/2026)

## Objetivo
Testar preenchimento de recibos sem mudar os aplicativos oficiais, sem migrar dados, e sem criar tabelas novas no Supabase.

## Endereços
- Recebi+ **original**: https://advandrerbernardo-maker.github.io/Recebi-plus/
- Recebi+ **experimento**: https://advandrerbernardo-maker.github.io/Recebi-plus/integracao-teste.html
- Daiz-e **original**: https://advandrerbernardo-maker.github.io/Daiz-e/
- Daiz-e **experimento**: https://advandrerbernardo-maker.github.io/Daiz-e/integracao-teste.html

## Teste inicial (seguro)
1. No Chrome do celular, abra o Recebi+ experimental e escolha **Testar com dados fictícios**.
2. A página redireciona para o Daiz-e experimental.
3. Verifique se há um rascunho com Cliente Demonstração, R$ 1.500,00 e descrição de uma entrada fictícia.
4. Confira manualmente data, forma de pagamento e outros campos. Toque em **Revisar recibo** e, se desejar, **Confirmar emissão**.
5. Teste PDF ou outros formatos e verifique a marca **TESTE - SEM VALIDADE**.
6. Em **Apagar somente testes**, exclua tudo que foi criado no ambiente experimental.
7. Abra os links originais. Nada deve ter sido incorporado ao histórico real.

## Teste com cobrança REAL já marcada PAGA
1. Abra o Recebi+ experimental no mesmo navegador.
2. Autentique-se, se necessário, e toque em **Atualizar cobranças pagas**.
3. Escolha uma cobrança cujo recebimento você já confirmou no mundo real.
4. O Recebi+ consulta novamente a cobrança no Supabase, verifica a titularidade e o status PAGO e prepara um rascunho experimental no Daiz-e.
5. **Não ocorre confirmação de pagamento, gravação no Supabase nem emissão automática de recibo.**
6. O recibo continua apenas experimental e sem validade, mesmo com os dados reais.

## Como a ponte funciona
- Os dois sites compartilham a origem `https://advandrerbernardo-maker.github.io`; o Chrome permite uma transferência temporária dentro dessa origem.
- Uma chave `recebiplus-daize-beta-handoff-v1` guarda **nome, centavos e descrição**, por no máximo três minutos.
- A chave é eliminada quando o Daiz-e experimental a lê. CPF, telefone, senha e tokens de autenticação **não são transferidos**.
- Ao usar um navegador diferente ou abrir em dispositivos diferentes, essa ponte local **não funciona**.
- Clientes, recibos, assinatura e preferências criados no Daiz-e experimental usam um prefixo de armazenamento exclusivo e não substituem as chaves do aplicativo oficial.
- Não há operação de gravação no banco de dados do Recebi+ a partir da página experimental.
- A página experimental Daiz-e recebe marcas de teste no PDF/PNG/JPEG/DOCX e na prévia, para impedir confusão com recibos válidos.
- O Service Worker do Daiz-e preserva o índice original no cache offline, armazenando a página de teste sob endereço próprio.

## Desfazer imediatamente no celular
1. No Daiz-e experimental, use **Apagar somente testes**.
2. No Recebi+ experimental, use **Descartar transferência pendente**, se houver.
3. Volte a utilizar os links **originais**; não é preciso reinstalar apps nem deslogar.
4. Dados oficiais não são removidos.

## Desfazer totalmente no GitHub
Foram criadas, antes de qualquer alteração, as branches de segurança:
- Recebi+: `backup-antes-integracao-20261023` (commit `a86dd42ad3301a2ce3f2069fcba42e68078e8503`)
- Daiz-e: `backup-antes-integracao-20261023` (commit `e09ce623cbb4bfc02a811645e97954f56437c835`)

Para retirar a prova de conceito do GitHub e repor os arquivos originais, exclua `integracao-teste.html` dos dois repositórios e restaure `Daiz-e/sw.js` a partir da branch de segurança. Os `index.html` originais nunca foram modificados. Este documento também poderá ser removido quando o teste terminar.

## Limitações
A publicação dos arquivos pode ser validada nos logs do GitHub Pages. O teste completo de navegação, compartilhamento e interrupção de internet em Android depende da execução no aparelho. A sincronização permanente entre dispositivos ou o registro cruzado automático de recibos **não fazem parte deste piloto**.

**Este é um protótipo reversível, não uma integração definitiva em produção.**
