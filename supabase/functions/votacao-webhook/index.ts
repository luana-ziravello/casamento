// Webhook do Mercado Pago para a Votação da gravata (notification_url das preferências).
//
// Nunca confia no conteúdo da notificação: ela só diz "o pagamento X mudou".
// O pagamento é sempre consultado na API oficial com o token do servidor, e o
// banco decide se ele entra no resultado (aprovado + horário oficial de
// aprovação dentro da votação). Notificações repetidas só atualizam a mesma
// linha (chave = id do pagamento), sem duplicar contribuições.
//
// Se MERCADOPAGO_WEBHOOK_SECRET estiver configurado, notificações com
// assinatura x-signature inválida são descartadas.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { buscarPagamentoMP, contribuicaoDaReferencia, MP_ACCESS_TOKEN, registrarPagamento, verificarAssinatura } from '../_shared/votacao.ts';

const ok = () => new Response('ok', { status: 200 });

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    let paymentId = url.searchParams.get('data.id') || url.searchParams.get('id');
    let topico = url.searchParams.get('type') || url.searchParams.get('topic');

    if (req.method === 'POST') {
      try {
        const body = await req.json();
        paymentId = paymentId || body?.data?.id || body?.id;
        topico = topico || body?.type || body?.topic;
      } catch {
        // corpo vazio — segue com a querystring
      }
    }

    if (topico !== 'payment' || !paymentId || !MP_ACCESS_TOKEN) return ok();
    paymentId = String(paymentId);
    if (!/^\d{1,30}$/.test(paymentId)) return ok();

    const assinatura = await verificarAssinatura(req, url.searchParams.get('data.id'));
    if (assinatura === 'invalida') {
      console.warn('Notificação com assinatura inválida descartada', paymentId);
      return new Response('assinatura invalida', { status: 401 });
    }

    const pagamento = await buscarPagamentoMP(paymentId);
    // Falha temporária na API: responde erro para o Mercado Pago tentar de novo.
    if (!pagamento) return new Response('tente novamente', { status: 503 });
    if (!contribuicaoDaReferencia(pagamento.external_reference)) return ok(); // não é da votação

    const resultado = await registrarPagamento(pagamento);
    console.log('votacao-webhook', paymentId, pagamento.status, JSON.stringify(resultado));
    return ok();
  } catch (err) {
    console.error('Erro no webhook da votação', err);
    // erro nosso (ex.: banco indisponível): pede reenvio
    return new Response('erro', { status: 500 });
  }
});
