// Código compartilhado pelas funções da Votação da gravata.
// Tokens e chaves ficam só aqui no servidor (variáveis de ambiente do Supabase).

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
export const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
export const MP_ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN') ?? '';
// Opcional: chave secreta de assinatura dos webhooks (Mercado Pago > Suas integrações > Webhooks).
export const MP_WEBHOOK_SECRET = Deno.env.get('MERCADOPAGO_WEBHOOK_SECRET') ?? '';

export const PREFIXO_REFERENCIA = 'votacao-';
export const VALOR_MINIMO = 1;
export const VALOR_MAXIMO = 10000;

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-votacao-senha',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/** Chama uma função SQL com o service_role. */
export async function rpc<T = unknown>(nome: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`rpc ${nome} falhou (${res.status}): ${texto}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

/** Consulta direta ao PostgREST com o service_role. */
export async function rest<T = unknown>(caminho: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`rest ${caminho} falhou (${res.status}): ${texto}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

export async function senhaAdminValida(senha: unknown): Promise<boolean> {
  if (typeof senha !== 'string' || !senha || senha.length > 200) return false;
  try {
    return (await rpc<boolean>('votacao_admin_ok', { p_senha: senha })) === true;
  } catch (err) {
    console.error('Falha ao validar senha', err);
    return false;
  }
}

/** Nome: obrigatório, 2–60 caracteres, espaços normalizados, sem caracteres de controle. */
export function validarNome(bruto: unknown): string | null {
  if (typeof bruto !== 'string') return null;
  // deno-lint-ignore no-control-regex
  const nome = bruto.replace(/[\u0000-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
  if (nome.length < 2 || nome.length > 60) return null;
  return nome;
}

/**
 * Valor em reais vindo do formulário: aceita número ou texto ("50", "50,5",
 * "1.234,56", "R$ 20,00"). Devolve em reais com 2 casas, ou null se inválido.
 */
export function validarValor(bruto: unknown): number | null {
  let n: number;
  if (typeof bruto === 'number') {
    n = bruto;
  } else if (typeof bruto === 'string') {
    let s = bruto.replace(/R\$|\s/gi, '');
    if (!/^[\d.,]+$/.test(s)) return null;
    if (s.includes(',')) {
      s = s.replace(/\./g, '').replace(',', '.'); // formato brasileiro
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, ''); // "1.000" = mil
    }
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
    n = Number(s);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  const centavos = Math.round(n * 100);
  if (Math.abs(centavos - n * 100) > 1e-6) return null; // mais de 2 casas decimais
  const valor = centavos / 100;
  if (valor < VALOR_MINIMO || valor > VALOR_MAXIMO) return null;
  return valor;
}

export function contribuicaoDaReferencia(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const m = ref.match(/^votacao-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
  return m ? m[1].toLowerCase() : null;
}

export function ehUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// deno-lint-ignore no-explicit-any
export type PagamentoMP = Record<string, any>;

/** Pagamento na API oficial. `undefined` = não existe nesta conta; `null` = falha temporária. */
export async function buscarPagamentoMP(id: string): Promise<PagamentoMP | null | undefined> {
  const res = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
  });
  if (res.status === 404) return undefined;
  if (!res.ok) {
    console.error('Falha ao consultar pagamento', id, res.status, await res.text().catch(() => ''));
    return null;
  }
  return await res.json();
}

/** Busca na API do Mercado Pago todos os pagamentos de uma contribuição. */
export async function buscarPagamentosDaContribuicao(contribuicaoId: string): Promise<PagamentoMP[]> {
  const ref = PREFIXO_REFERENCIA + contribuicaoId;
  const url = `https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(ref)}&sort=date_created&criteria=desc&limit=20`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` } });
  if (!res.ok) {
    console.error('Falha na busca de pagamentos', ref, res.status, await res.text().catch(() => ''));
    return [];
  }
  const dados = await res.json();
  // confere de novo a referência, por segurança
  return (Array.isArray(dados?.results) ? dados.results : []).filter(
    (p: PagamentoMP) => contribuicaoDaReferencia(p?.external_reference) === contribuicaoId,
  );
}

export type ResultadoRegistro = {
  resultado: string;
  elegivel?: boolean;
  motivo?: string | null;
  lider_mudou?: boolean;
};

/**
 * Registra um pagamento consultado na API oficial. A decisão de elegibilidade
 * (aprovado, valor, horário oficial de aprovação dentro da votação) fica no banco.
 */
export async function registrarPagamento(p: PagamentoMP): Promise<ResultadoRegistro> {
  const contribuicao = contribuicaoDaReferencia(p?.external_reference);
  if (!contribuicao || p?.id == null) return { resultado: 'ignorado' };
  return await rpc<ResultadoRegistro>('votacao_registrar_pagamento', {
    p_payment_id: String(p.id),
    p_contribuicao: contribuicao,
    p_status: String(p.status ?? ''),
    p_status_detalhe: p.status_detail ? String(p.status_detail) : null,
    p_valor: typeof p.transaction_amount === 'number' ? p.transaction_amount : null,
    p_moeda: p.currency_id ? String(p.currency_id) : null,
    p_aprovado_em: p.date_approved || null,
  });
}

/** Status resumido para o convidado (sem valores). */
export function statusPublico(pagamentos: PagamentoMP[]): string {
  const st = pagamentos.map((p) => p?.status);
  if (st.includes('approved')) return 'aprovado';
  if (st.some((s) => s === 'pending' || s === 'in_process' || s === 'authorized')) return 'pendente';
  if (st.some((s) => s === 'rejected')) return 'recusado';
  if (st.some((s) => s === 'cancelled' || s === 'refunded' || s === 'charged_back')) return 'cancelado';
  return 'nao_encontrado';
}

/**
 * Validação da assinatura x-signature do Mercado Pago (HMAC-SHA256).
 * Template: "id:[data.id];request-id:[x-request-id];ts:[ts];" — partes ausentes
 * são omitidas; data.id alfanumérico vai em minúsculas.
 * Retorna 'valida', 'invalida' ou 'ausente' (sem cabeçalho ou sem segredo configurado).
 */
export async function verificarAssinatura(req: Request, dataId: string | null): Promise<'valida' | 'invalida' | 'ausente'> {
  const cabecalho = req.headers.get('x-signature');
  if (!MP_WEBHOOK_SECRET || !cabecalho) return 'ausente';
  let ts = '';
  let v1 = '';
  for (const parte of cabecalho.split(',')) {
    const [k, ...resto] = parte.split('=');
    const v = resto.join('=').trim();
    if (k.trim() === 'ts') ts = v;
    if (k.trim() === 'v1') v1 = v;
  }
  if (!ts || !v1) return 'invalida';
  const requestId = req.headers.get('x-request-id');
  let manifest = '';
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  const chave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(MP_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return 'invalida';
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0 ? 'valida' : 'invalida';
}
