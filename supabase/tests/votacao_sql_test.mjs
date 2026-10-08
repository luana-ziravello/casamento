import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';
const db = new PGlite({ extensions: { pgcrypto } });
const q = async (sql, p) => (await db.query(sql, p)).rows;
let falhas = 0;
const ok = (cond, msg, extra) => { console.log((cond ? 'OK   ' : 'FALHA ') + msg + (extra !== undefined ? '  ' + JSON.stringify(extra) : '')); if (!cond) falhas++; };

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema extensions; create extension pgcrypto schema extensions;
  create publication supabase_realtime;
  grant usage on schema public to anon, authenticated, service_role; grant usage on schema extensions to service_role;
`);
await db.exec(fs.readFileSync(process.argv[2], 'utf8'));
await db.exec(`grant all on all tables in schema public to service_role;`);
ok(true, 'migração aplicada sem erros');

const pub = await q(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
ok(pub.length === 1 && pub[0].tablename === 'votacao_estado', 'Realtime publica só votacao_estado', pub);
const colunas = await q(`select column_name from information_schema.columns where table_name='votacao_estado' order by ordinal_position`);
ok(!colunas.some(c => /valor|email/.test(c.column_name)), 'tabela do Realtime não tem valores nem e-mails', colunas.map(c=>c.column_name));

// ---- público antes da liberação
await db.exec('set role anon');
let est = (await q('select public.votacao_estado_publico() e'))[0].e;
ok(est.liberada === false && !('lider_nome' in est) && !('fim' in est), 'antes de 10/10 18h o público não recebe dados', est);
ok((await q('select * from public.votacao_estado')).length === 0, 'RLS: tabela de estado invisível antes da liberação');
for (const [sql, nome] of [
  ['select * from public.votacao_contribuicoes', 'ler contribuições'],
  ['select * from public.votacao_pagamentos', 'ler pagamentos'],
  ['select * from public.votacao_admin', 'ler hash da senha'],
  ['select public.votacao_iniciar()', 'iniciar votação'],
  ['select public.votacao_reiniciar()', 'reiniciar votação'],
  ["select public.votacao_nova_contribuicao('X', 10, true)", 'criar contribuição direto no banco'],
  ["select public.votacao_registrar_pagamento('1', gen_random_uuid(), 'approved', null, 10, 'BRL', now())", 'registrar pagamento falso'],
  ["select public.votacao_admin_ok('x')", 'testar senha direto no banco'],
  ["update public.votacao_estado set lider_nome='Hacker'", 'alterar o líder'],
]) {
  let negado = false; try { await q(sql); } catch { negado = true; }
  ok(negado, `convidado NÃO consegue ${nome}`);
}
await db.exec('reset role');
await db.exec('set role service_role');

// ---- senha admin
await q(`insert into public.votacao_admin (id, senha_hash) values (1, extensions.crypt('senha-certa', extensions.gen_salt('bf', 10)))`);
ok((await q(`select public.votacao_admin_ok('senha-certa') v`))[0].v === true, 'senha certa aceita');
ok((await q(`select public.votacao_admin_ok('senha-errada') v`))[0].v === false, 'senha errada recusada');
ok((await q(`select public.votacao_admin_ok(null) v`))[0].v === false, 'senha vazia recusada');

// ---- antes do início
let r = (await q(`select public.votacao_nova_contribuicao('Ana', 10, false) r`))[0].r;
ok(r.erro === 'indisponivel', 'convidado não contribui antes da liberação', r);
r = (await q(`select public.votacao_nova_contribuicao('Ana', 10, true) r`))[0].r;
ok(r.erro === 'nao_iniciada', 'nem a prévia contribui antes de iniciar o timer', r);

// ---- início único
const i1 = (await q(`select public.votacao_iniciar() r`))[0].r;
const i2 = (await q(`select public.votacao_iniciar() r`))[0].r;
ok(i1.iniciou_agora === true && i2.iniciou_agora === false && i1.fim === i2.fim, 'clique repetido não reinicia o timer', { i1, i2 });
const dur = (await q(`select extract(epoch from fim - inicio) s from public.votacao_estado`))[0].s;
ok(Number(dur) === 1200, 'prazo registrado no servidor: 20 minutos', dur);

// ---- validações no servidor
for (const [nome, valor, erro] of [[' ', 10, 'nome_invalido'], ['A', 10, 'nome_invalido'], ['Ana', 0.5, 'valor_invalido'], ['Ana', 10000.01, 'valor_invalido'], ['Ana', 10.123, 'valor_invalido'], ['Ana', null, 'valor_invalido']]) {
  r = (await q(`select public.votacao_nova_contribuicao($1, $2, true) r`, [nome, valor]))[0].r;
  ok(r.erro === erro, `recusa nome=${JSON.stringify(nome)} valor=${valor}`, r);
}

const nova = async (nome, valor) => (await q(`select public.votacao_nova_contribuicao($1, $2, true) r`, [nome, valor]))[0].r.id;
const reg = async (pid, cid, status, valor, aprovadoSql) =>
  (await q(`select public.votacao_registrar_pagamento($1, $2, $3, null, $4, 'BRL', ${aprovadoSql}) r`, [pid, cid, status, valor]))[0].r;
const lider = async () => (await q(`select lider_nome from public.votacao_estado`))[0].lider_nome;
const T = (min) => `(select inicio from public.votacao_estado) + interval '${min} minutes'`;

const ana = await nova('  Ana   Paula ', 100);
ok((await q('select nome from public.votacao_contribuicoes where id=$1', [ana]))[0].nome === 'Ana Paula', 'nome salvo normalizado');
const bia = await nova('Bia', 100);
const caio1 = await nova('Caio', 60);
const caio2 = await nova('Caio', 60);
const davi = await nova('Davi', 500);
const edu = await nova('Edu', 1000);

ok(await lider() === null, 'sem aprovação: "Quem vai inaugurar a brincadeira?"');

r = await reg('p1', ana, 'pending', 100, 'null');
ok(r.elegivel === false && await lider() === null, 'pagamento pendente não muda o destaque', r);
r = await reg('p1', ana, 'rejected', 100, 'null');
ok(await lider() === null, 'pagamento recusado não muda o destaque');
r = await reg('p2', ana, 'approved', 100, T(5));
ok(r.elegivel === true && await lider() === 'Ana Paula', 'aprovação atualiza o destaque', r);

r = await reg('p2', ana, 'approved', 100, T(5));
const linhas = (await q(`select count(*)::int n, max(notificacoes) k from public.votacao_pagamentos where mp_payment_id='p2'`))[0];
ok(r.resultado === 'atualizado' && linhas.n === 1 && linhas.k === 2, 'webhook duplicado não duplica a contribuição', { r, linhas });

r = await reg('p3', bia, 'approved', 100, T(7));
ok(await lider() === 'Ana Paula', 'empate: fica quem atingiu o valor primeiro (Ana, 5 min < Bia, 7 min)');

await reg('p4', caio1, 'approved', 60, T(8));
await reg('p5', caio2, 'approved', 60, T(9));
ok(await lider() === 'Ana Paula', 'não soma pagamentos da mesma pessoa (Caio 60 + 60 não passa 100)');

r = await reg('p6', davi, 'approved', 5, T(10));
ok(r.elegivel === false && r.motivo === 'valor_divergente' && await lider() === 'Ana Paula', 'valor pago diferente do escolhido não conta', r);

r = await reg('p7', davi, 'approved', 500, T(19.9));
ok(r.elegivel === true && await lider() === 'Davi', 'maior contribuição individual assume o destaque', r);

// webhook atrasado: aprovado ANTES do fim, notificação chega depois
await q(`update public.votacao_estado set fim = now() - interval '1 second', inicio = now() - interval '20 minutes 1 second'`);
r = (await q(`select public.votacao_nova_contribuicao('Fulano', 50, true) r`))[0].r;
ok(r.erro === 'encerrada', 'após 00:00 o backend bloqueia novas contribuições', r);
r = await reg('p8', edu, 'approved', 1000, `(select fim from public.votacao_estado) + interval '2 minutes'`);
ok(r.elegivel === false && r.motivo === 'aprovado_apos_encerramento' && await lider() === 'Davi', 'pagamento aprovado depois do encerramento não entra', r);
const bia2 = bia;
r = await reg('p9', caio2, 'approved', 60, `(select fim from public.votacao_estado) - interval '10 seconds'`);
ok(r.elegivel === true, 'webhook atrasado de pagamento aprovado DENTRO do prazo é aceito pelo horário oficial', r);

// estorno do líder
r = await reg('p7', davi, 'refunded', 500, T(19.9));
ok(r.elegivel === false && await lider() === 'Ana Paula', 'estorno/cancelamento tira do resultado e recalcula', await lider());

// público depois da liberação (simulada trocando a função de liberação)
await db.exec('reset role');
await db.exec(`create or replace function public.votacao_liberacao() returns timestamptz language sql immutable as $$ select timestamptz '2026-01-01 00:00:00-03:00' $$`);
await db.exec('set role anon');
est = (await q('select public.votacao_estado_publico() e'))[0].e;
ok(est.liberada === true && est.lider_nome === 'Ana Paula' && !JSON.stringify(est).match(/valor|100|500/), 'após liberação o público recebe só nome e horários', est);
const visivel = await q('select * from public.votacao_estado');
ok(visivel.length === 1, 'RLS libera a linha de estado (Realtime) após a liberação');
let negado = false; try { await q('select valor from public.votacao_contribuicoes'); } catch { negado = true; }
ok(negado, 'valores continuam inacessíveis ao público após a liberação');
r = null; negado = false; try { await q(`select public.votacao_nova_contribuicao('X', 10, false)`); } catch { negado = true; }
ok(negado, 'mesmo liberado, convidado só contribui pela função do servidor');
await db.exec('reset role');
await db.exec('set role service_role');

// reinício
r = (await q(`select public.votacao_reiniciar() r`))[0].r;
const e2 = (await q(`select * from public.votacao_estado`))[0];
ok(r.rodada === 2 && e2.inicio === null && e2.lider_nome === null, 'reiniciar abre nova rodada zerada', e2);
r = await reg('p10', ana, 'approved', 100, 'now()');
ok(r.elegivel === false && r.motivo === 'rodada_anterior' && await lider() === null, 'pagamento de rodada anterior não contamina a nova', r);
const hist = (await q(`select count(*)::int n from public.votacao_contribuicoes where rodada = 1`))[0].n;
ok(hist === 6, 'histórico da rodada anterior preservado', hist);
r = await reg('p11', '00000000-0000-0000-0000-000000000000', 'approved', 10, 'now()');
ok(r.resultado === 'contribuicao_desconhecida', 'pagamento de referência desconhecida é ignorado', r);

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTodos os testes passaram.');
process.exit(falhas ? 1 : 0);
