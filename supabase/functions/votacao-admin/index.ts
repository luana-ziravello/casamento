// Votação da gravata — ações do administrador. Toda chamada exige a senha da
// votação no cabeçalho x-votacao-senha, conferida no banco (hash bcrypt).
//   { acao: 'entrar' }                       -> só valida a senha
//   { acao: 'estado' }                       -> estado + contribuições da rodada atual
//   { acao: 'iniciar' }                      -> inicia o timer (uma única vez)
//   { acao: 'conferir' }                     -> reconsulta no Mercado Pago as contribuições sem aprovação
//   { acao: 'reiniciar', confirmacao: 'REINICIAR' } -> nova rodada (zera timer e destaque)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {
  buscarPagamentosDaContribuicao, CORS_HEADERS, json, MP_ACCESS_TOKEN, registrarPagamento, rest, rpc, senhaAdminValida,
} from '../_shared/votacao.ts';

type Estado = { rodada: number; inicio: string | null; fim: string | null; lider_nome: string | null; liberada: boolean; agora: string; liberacao: string };

async function contribuicoesDaRodada(rodada: number) {
  return await rest<unknown[]>(
    `votacao_contribuicoes?rodada=eq.${rodada}` +
      '&select=id,nome,valor,previa,criado_em,votacao_pagamentos(mp_payment_id,status,status_detalhe,valor_pago,aprovado_em,elegivel,motivo,notificacoes)' +
      '&order=criado_em.desc',
  );
}

async function estadoCompleto() {
  const estado = await rpc<Estado>('votacao_estado_admin');
  const contribuicoes = await contribuicoesDaRodada(estado.rodada);
  return { estado, contribuicoes };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  if (!(await senhaAdminValida(req.headers.get('x-votacao-senha')))) {
    await new Promise((r) => setTimeout(r, 700)); // desacelera tentativas
    return json({ error: 'Senha incorreta.' }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sem corpo */ }

  try {
    switch (body.acao) {
      case 'entrar':
        return json({ ok: true });

      case 'estado':
        return json(await estadoCompleto());

      case 'iniciar': {
        const r = await rpc<{ iniciou_agora: boolean; inicio: string; fim: string }>('votacao_iniciar');
        return json({ ...r, ...(await estadoCompleto()) });
      }

      case 'reiniciar': {
        if (body.confirmacao !== 'REINICIAR') {
          return json({ error: 'Para reiniciar, digite REINICIAR na confirmação.' }, 400);
        }
        await rpc('votacao_reiniciar');
        return json(await estadoCompleto());
      }

      case 'conferir': {
        if (!MP_ACCESS_TOKEN) return json({ error: 'Token do Mercado Pago não configurado.' }, 500);
        const { estado, contribuicoes } = await estadoCompleto();
        // deno-lint-ignore no-explicit-any
        const pendentes = (contribuicoes as any[]).filter(
          (c) => !(c.votacao_pagamentos || []).some((p: { status: string }) => p.status === 'approved'),
        );
        let encontrados = 0;
        for (const c of pendentes.slice(0, 60)) {
          const pagamentos = await buscarPagamentosDaContribuicao(c.id);
          for (const p of pagamentos) {
            await registrarPagamento(p);
            encontrados++;
          }
        }
        return json({ conferidas: Math.min(pendentes.length, 60), pagamentosEncontrados: encontrados, ...(await estadoCompleto()), rodada: estado.rodada });
      }

      default:
        return json({ error: 'Ação desconhecida' }, 400);
    }
  } catch (err) {
    console.error('Erro no painel da votação', err);
    return json({ error: 'Não foi possível concluir agora.' }, 500);
  }
});
