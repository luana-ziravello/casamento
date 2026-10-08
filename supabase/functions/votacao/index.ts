// Votação da gravata — ações públicas (com a chave publicável do site):
//   { acao: 'contribuir', nome, valor, siteBaseUrl }  -> cria a contribuição e o checkout
//   { acao: 'conferir', contribuicaoId }              -> confere na API do Mercado Pago
// Antes da liberação (10/10 18h), "contribuir" só funciona com a senha da
// votação no cabeçalho x-votacao-senha (prévia do administrador).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  buscarPagamentosDaContribuicao, CORS_HEADERS, ehUuid, json, MP_ACCESS_TOKEN, PREFIXO_REFERENCIA,
  registrarPagamento, rest, rpc, senhaAdminValida, statusPublico, SUPABASE_URL, validarNome, validarValor,
  VALOR_MAXIMO, VALOR_MINIMO,
} from '../_shared/votacao.ts';

const SITE_PADRAO = 'https://luana-ziravello.github.io/casamento/';

const ERROS: Record<string, [number, string]> = {
  indisponivel: [403, 'A votação ainda não está disponível.'],
  nao_iniciada: [409, 'A votação começará em instantes!'],
  encerrada: [409, 'Votação encerrada! Obrigada por participar desse momento com a gente.'],
  nome_invalido: [400, 'Preencha seu nome (de 2 a 60 caracteres).'],
  valor_invalido: [400, `Informe um valor entre R$ ${VALOR_MINIMO},00 e R$ ${VALOR_MAXIMO.toLocaleString('pt-BR')},00.`],
};

/** Data no formato aceito pelo Mercado Pago, no fuso de São Paulo (UTC-03:00, sem horário de verão). */
function isoSaoPaulo(d: Date) {
  const local = new Date(d.getTime() - 3 * 3600_000);
  return local.toISOString().replace('Z', '-03:00');
}

function baseDoSite(siteBaseUrl: unknown, origem: string | null) {
  if (typeof siteBaseUrl === 'string' && /^https?:\/\/[^\s?#]+\/$/.test(siteBaseUrl) && siteBaseUrl.length < 300) return siteBaseUrl;
  if (origem && /^https?:\/\/[^\s/]+$/.test(origem)) return origem + '/';
  return SITE_PADRAO;
}

async function criarPreferencia(corpo: Record<string, unknown>) {
  const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const dados = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, dados };
}

async function contribuir(req: Request, body: Record<string, unknown>) {
  if (!MP_ACCESS_TOKEN) {
    console.error('MERCADOPAGO_ACCESS_TOKEN não configurado');
    return json({ error: 'Pagamento indisponível no momento.' }, 500);
  }
  const nome = validarNome(body.nome);
  if (!nome) return json({ error: ERROS.nome_invalido[1] }, 400);
  const valor = validarValor(body.valor);
  if (valor == null) return json({ error: ERROS.valor_invalido[1] }, 400);

  const previa = await senhaAdminValida(req.headers.get('x-votacao-senha'));

  const criada = await rpc<{ id?: string; fim?: string; erro?: string }>('votacao_nova_contribuicao', {
    p_nome: nome, p_valor: valor, p_previa: previa,
  });
  if (criada?.erro || !criada?.id) {
    const [status, msg] = ERROS[criada?.erro ?? ''] ?? [500, 'Não foi possível iniciar a contribuição.'];
    return json({ error: msg, codigo: criada?.erro }, status);
  }

  const id = criada.id;
  const fim = new Date(criada.fim!);
  const base = baseDoSite(body.siteBaseUrl, req.headers.get('origin'));
  const retorno = `${base}votacao.html?contribuicao=${id}`;

  const preferencia: Record<string, unknown> = {
    items: [{
      id: 'votacao-gravata',
      title: 'Brincadeira da gravata — Luana & Heitor',
      quantity: 1,
      currency_id: 'BRL',
      unit_price: valor,
    }],
    external_reference: PREFIXO_REFERENCIA + id,
    notification_url: `${SUPABASE_URL}/functions/v1/votacao-webhook`,
    back_urls: { success: retorno, pending: retorno, failure: retorno },
    auto_return: 'approved',
    // o link do checkout deixa de abrir quando a votação termina
    expires: true,
    expiration_date_from: isoSaoPaulo(new Date(Date.now() - 60_000)),
    expiration_date_to: isoSaoPaulo(fim),
    // Pix gerado no checkout também vence no fim da votação
    date_of_expiration: isoSaoPaulo(fim),
    // boleto e pagamento em lotérica podem ser pagos dias depois: ficam de fora
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
  };

  let mp = await criarPreferencia(preferencia);
  if (!mp.ok && JSON.stringify(mp.dados).includes('date_of_expiration')) {
    // Se o Mercado Pago recusar o vencimento curto do Pix, cria sem ele: pagamentos
    // aprovados depois do encerramento continuam fora do resultado (horário oficial).
    console.warn('date_of_expiration recusado; criando sem ele', JSON.stringify(mp.dados));
    delete preferencia.date_of_expiration;
    mp = await criarPreferencia(preferencia);
  }
  if (!mp.ok) {
    console.error('Erro Mercado Pago', mp.status, JSON.stringify(mp.dados));
    return json({ error: 'Não foi possível abrir o Mercado Pago agora. Tente novamente.' }, 502);
  }

  await rest(`votacao_contribuicoes?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ mp_preference_id: String(mp.dados.id ?? '') }),
  }).catch((err) => console.error('Falha ao salvar preference id', err));

  return json({ checkoutUrl: mp.dados.init_point || mp.dados.sandbox_init_point, contribuicaoId: id });
}

async function conferir(body: Record<string, unknown>) {
  const id = body.contribuicaoId;
  if (!ehUuid(id)) return json({ error: 'Contribuição inválida.' }, 400);
  const existe = await rest<{ id: string }[]>(`votacao_contribuicoes?id=eq.${id.toLowerCase()}&select=id`);
  if (!existe.length) return json({ status: 'nao_encontrado' });
  if (!MP_ACCESS_TOKEN) return json({ status: 'pendente' });

  const pagamentos = await buscarPagamentosDaContribuicao(id.toLowerCase());
  for (const p of pagamentos) {
    try { await registrarPagamento(p); } catch (err) { console.error('Falha ao registrar', err); }
  }
  // Só o status — nunca valores, e-mails ou dados do pagador.
  return json({ status: statusPublico(pagamentos) });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Requisição inválida' }, 400);
  }
  try {
    if (body?.acao === 'contribuir') return await contribuir(req, body);
    if (body?.acao === 'conferir') return await conferir(body);
    return json({ error: 'Ação desconhecida' }, 400);
  } catch (err) {
    console.error('Erro inesperado', err);
    return json({ error: 'Não foi possível concluir agora. Tente novamente.' }, 500);
  }
});
