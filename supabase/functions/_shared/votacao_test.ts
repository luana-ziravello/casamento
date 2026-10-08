// Testes das regras de validação da Votação. Rodar com:
//   deno test --allow-env supabase/functions/_shared/votacao_test.ts
Deno.env.set('MERCADOPAGO_WEBHOOK_SECRET', 'segredo-de-teste');
const m = await import('./votacao.ts');

function igual(a: unknown, b: unknown, msg?: string) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg ?? ''} esperado ${JSON.stringify(b)}, veio ${JSON.stringify(a)}`);
}

Deno.test('valor livre: formatos aceitos', () => {
  igual(m.validarValor('50'), 50);
  igual(m.validarValor('50,5'), 50.5);
  igual(m.validarValor('50,50'), 50.5);
  igual(m.validarValor('1.234,56'), 1234.56);
  igual(m.validarValor('1.000'), 1000);
  igual(m.validarValor('R$ 20,00'), 20);
  igual(m.validarValor('7.5'), 7.5);
  igual(m.validarValor(33.33), 33.33);
  igual(m.validarValor('1'), 1);
  igual(m.validarValor('10000'), 10000);
});

Deno.test('valor livre: recusados', () => {
  for (const v of ['', 'abc', '0', '0,99', '10000,01', '-5', '5,123', '1e3', '50,00,0', null, undefined, NaN, Infinity, {}, 0.5, 12.345]) {
    igual(m.validarValor(v), null, `valor ${String(v)}`);
  }
});

Deno.test('nome obrigatório e normalizado', () => {
  igual(m.validarNome('  Tia   Márcia  '), 'Tia Márcia');
  igual(m.validarNome('A'), null);
  igual(m.validarNome('   '), null);
  igual(m.validarNome(42), null);
  igual(m.validarNome('x'.repeat(61)), null);
  igual(m.validarNome('Ana\u0000Paula'), 'AnaPaula');
});

Deno.test('referência externa da votação', () => {
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  igual(m.contribuicaoDaReferencia('votacao-' + id), id);
  igual(m.contribuicaoDaReferencia('votacao-' + id.toUpperCase()), id);
  igual(m.contribuicaoDaReferencia('123'), null); // pedidos da lista de presentes
  igual(m.contribuicaoDaReferencia('votacao-123'), null);
  igual(m.contribuicaoDaReferencia(undefined), null);
});

Deno.test('status público sem valores', () => {
  igual(m.statusPublico([]), 'nao_encontrado');
  igual(m.statusPublico([{ status: 'rejected' }, { status: 'approved' }]), 'aprovado');
  igual(m.statusPublico([{ status: 'in_process' }]), 'pendente');
  igual(m.statusPublico([{ status: 'cancelled' }]), 'cancelado');
});

async function assinar(manifest: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode('segredo-de-teste'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(manifest));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.test('assinatura x-signature do webhook', async () => {
  const v1 = await assinar('id:123456;request-id:req-1;ts:1700000000;');
  const ok = new Request('https://x/?data.id=123456&type=payment', {
    method: 'POST', headers: { 'x-signature': `ts=1700000000,v1=${v1}`, 'x-request-id': 'req-1' },
  });
  igual(await m.verificarAssinatura(ok, '123456'), 'valida');

  const adulterada = new Request('https://x/?data.id=999&type=payment', {
    method: 'POST', headers: { 'x-signature': `ts=1700000000,v1=${v1}`, 'x-request-id': 'req-1' },
  });
  igual(await m.verificarAssinatura(adulterada, '999'), 'invalida');

  const semCabecalho = new Request('https://x/?data.id=1', { method: 'POST' });
  igual(await m.verificarAssinatura(semCabecalho, '1'), 'ausente');
});
