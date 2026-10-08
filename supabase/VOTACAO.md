# Votação — brincadeira da gravata

## Endereços
- Convidados: `votacao.html` (menu "Votação" aparece em 10/10/2026 às 18h, horário de Brasília)
- Prévia e controle: `votacao.html?admin` — senha do painel dos noivos (conferida no servidor).
  Quem entrou no `admin.html` com a senha completa abre direto pela aba "Votação".

## No dia
1. Abra `votacao.html?admin` no celular e entre.
2. Na hora da brincadeira, toque em **Iniciar votação** e confirme. O timer de 20:00 começa para todos.
3. Ao chegar em 00:00 a votação encerra sozinha. Se algum convidado disser que pagou e o nome não mudou,
   toque em **Conferir pagamentos** (reconsulta o Mercado Pago).
4. Se testaram antes, use **Reiniciar votação…** (digitar REINICIAR) antes da festa para zerar o timer e o destaque.

## Regras (servidor)
- Valor livre de R$ 1,00 a R$ 10.000,00; nome de 2 a 60 caracteres.
- Só conta pagamento **aprovado** pela API oficial do Mercado Pago, com valor igual ao escolhido,
  e com horário oficial de aprovação (`date_approved`) entre o início e o fim da votação.
- Maior pagamento individual (não soma pagamentos da mesma pessoa). Empate: quem foi aprovado primeiro.
- Webhook repetido não duplica (chave = id do pagamento). Estorno/cancelamento tira do resultado.
- Público só recebe o nome do líder e os horários; valores ficam só no controle.

## Limitações conhecidas
- O checkout expira no fim da votação (`expiration_date_to`) e o Pix vence no mesmo horário
  (`date_of_expiration`); boleto e lotérica ficam de fora. Mesmo assim, um cartão em análise pode ser
  aprovado depois do fim: esse pagamento aparece no controle como "fora do resultado" e não muda o destaque
  (o dinheiro entra normalmente na conta).
- Opcional: configurar `MERCADOPAGO_WEBHOOK_SECRET` (Mercado Pago > Suas integrações > Webhooks > chave secreta)
  nos secrets das Edge Functions para descartar notificações com assinatura inválida. Sem ela, a proteção é
  a consulta obrigatória de cada pagamento na API oficial.

## Testes
- `deno test --allow-env supabase/functions/_shared/votacao_test.ts`
- `node supabase/tests/votacao_sql_test.mjs supabase/migrations/20261008_votacao_gravata.sql` (precisa de `@electric-sql/pglite`)
