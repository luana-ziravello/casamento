-- ============================================================================
-- Votação da brincadeira da gravata (10/10/2026)
--
-- Tabelas
--   votacao_estado         1 linha: rodada, início/fim do timer e o NOME de quem
--                          tem a maior contribuição confirmada. É a única tabela
--                          legível pelo público (e só depois da liberação) e a
--                          única publicada no Realtime — não tem valores.
--   votacao_contribuicoes  cada clique em "Contribuir" (nome + valor escolhido).
--   votacao_pagamentos     cada pagamento do Mercado Pago ligado a uma
--                          contribuição, com o status e o horário OFICIAL de
--                          aprovação (date_approved).
--   votacao_admin          hash bcrypt da senha administrativa da votação.
--
-- As três últimas têm RLS ligado e nenhuma policy: só o service_role (Edge
-- Functions) acessa. Toda regra de negócio fica nas funções abaixo, que só o
-- service_role pode executar (exceto o estado público).
-- ============================================================================

create or replace function public.votacao_liberacao()
returns timestamptz language sql immutable as $$
  select timestamptz '2026-10-10 18:00:00-03:00'
$$;

create or replace function public.votacao_duracao()
returns interval language sql immutable as $$
  select interval '20 minutes'
$$;

create table if not exists public.votacao_estado (
  id smallint primary key default 1 check (id = 1),
  rodada integer not null default 1,
  inicio timestamptz,
  fim timestamptz,
  lider_nome text,
  atualizado_em timestamptz not null default now()
);
insert into public.votacao_estado (id) values (1) on conflict (id) do nothing;

create table if not exists public.votacao_contribuicoes (
  id uuid primary key default gen_random_uuid(),
  rodada integer not null,
  nome text not null check (char_length(nome) between 2 and 60),
  valor numeric(10,2) not null check (valor >= 1 and valor <= 10000),
  previa boolean not null default false,
  mp_preference_id text,
  criado_em timestamptz not null default now()
);
create index if not exists votacao_contribuicoes_rodada_idx on public.votacao_contribuicoes (rodada, criado_em);

create table if not exists public.votacao_pagamentos (
  mp_payment_id text primary key,
  contribuicao_id uuid not null references public.votacao_contribuicoes(id) on delete cascade,
  status text not null,
  status_detalhe text,
  valor_pago numeric(10,2),
  moeda text,
  aprovado_em timestamptz,
  elegivel boolean not null default false,
  motivo text,
  notificacoes integer not null default 1,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists votacao_pagamentos_contrib_idx on public.votacao_pagamentos (contribuicao_id);

create table if not exists public.votacao_admin (
  id smallint primary key default 1 check (id = 1),
  senha_hash text not null
);

alter table public.votacao_estado enable row level security;
alter table public.votacao_contribuicoes enable row level security;
alter table public.votacao_pagamentos enable row level security;
alter table public.votacao_admin enable row level security;

-- Público: só lê o estado (nome do líder + horários) a partir da liberação.
drop policy if exists votacao_estado_select_publico on public.votacao_estado;
create policy votacao_estado_select_publico on public.votacao_estado
  for select to anon, authenticated
  using (now() >= public.votacao_liberacao());

revoke all on public.votacao_contribuicoes, public.votacao_pagamentos, public.votacao_admin from anon, authenticated;
revoke insert, update, delete on public.votacao_estado from anon, authenticated;
grant select on public.votacao_estado to anon, authenticated;

-- Realtime: só a tabela de estado (sem valores, e-mails ou dados financeiros).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'votacao_estado'
  ) then
    alter publication supabase_realtime add table public.votacao_estado;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Estado público (chamado pela página via RPC com a chave publicável).
-- Antes da liberação devolve só "liberada: false" e o horário do servidor.
-- ---------------------------------------------------------------------------
create or replace function public.votacao_estado_publico()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  e public.votacao_estado;
begin
  if now() < public.votacao_liberacao() then
    return jsonb_build_object('liberada', false, 'agora', now(), 'liberacao', public.votacao_liberacao());
  end if;
  select * into e from public.votacao_estado where id = 1;
  return jsonb_build_object(
    'liberada', true,
    'agora', now(),
    'liberacao', public.votacao_liberacao(),
    'rodada', e.rodada,
    'inicio', e.inicio,
    'fim', e.fim,
    'lider_nome', e.lider_nome
  );
end $$;

-- Estado completo (prévia do administrador) — mesmo formato, sem trava de horário.
create or replace function public.votacao_estado_admin()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'liberada', now() >= public.votacao_liberacao(),
    'agora', now(),
    'liberacao', public.votacao_liberacao(),
    'rodada', e.rodada,
    'inicio', e.inicio,
    'fim', e.fim,
    'lider_nome', e.lider_nome
  ) from public.votacao_estado e where e.id = 1
$$;

-- ---------------------------------------------------------------------------
-- Senha administrativa (bcrypt via pgcrypto).
-- ---------------------------------------------------------------------------
create or replace function public.votacao_admin_ok(p_senha text)
returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    (select extensions.crypt(coalesce(p_senha, ''), a.senha_hash) = a.senha_hash from public.votacao_admin a where a.id = 1),
    false
  )
$$;

-- ---------------------------------------------------------------------------
-- Início único do timer: cliques repetidos devolvem o prazo já registrado.
-- ---------------------------------------------------------------------------
create or replace function public.votacao_iniciar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.votacao_estado;
begin
  select * into e from public.votacao_estado where id = 1 for update;
  if e.inicio is not null then
    return jsonb_build_object('iniciou_agora', false, 'inicio', e.inicio, 'fim', e.fim);
  end if;
  update public.votacao_estado
     set inicio = now(), fim = now() + public.votacao_duracao(), lider_nome = null, atualizado_em = now()
   where id = 1
  returning * into e;
  return jsonb_build_object('iniciou_agora', true, 'inicio', e.inicio, 'fim', e.fim);
end $$;

-- Reinício (só pelo painel, com confirmação explícita no front e no servidor):
-- abre uma nova rodada; o histórico das anteriores fica guardado.
create or replace function public.votacao_reiniciar()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.votacao_estado;
begin
  update public.votacao_estado
     set rodada = rodada + 1, inicio = null, fim = null, lider_nome = null, atualizado_em = now()
   where id = 1
  returning * into e;
  return jsonb_build_object('rodada', e.rodada);
end $$;

-- ---------------------------------------------------------------------------
-- Nova contribuição: só durante a votação aberta (o servidor é a referência).
-- p_previa = true permite ao administrador testar antes da liberação do menu,
-- mas o timer ainda precisa estar rodando.
-- ---------------------------------------------------------------------------
create or replace function public.votacao_nova_contribuicao(p_nome text, p_valor numeric, p_previa boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.votacao_estado;
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_id uuid;
begin
  select * into e from public.votacao_estado where id = 1 for share;
  if now() < public.votacao_liberacao() and not coalesce(p_previa, false) then
    return jsonb_build_object('erro', 'indisponivel');
  end if;
  if e.inicio is null or now() < e.inicio then
    return jsonb_build_object('erro', 'nao_iniciada');
  end if;
  if now() >= e.fim then
    return jsonb_build_object('erro', 'encerrada');
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then
    return jsonb_build_object('erro', 'nome_invalido');
  end if;
  if p_valor is null or p_valor <> round(p_valor, 2) or p_valor < 1 or p_valor > 10000 then
    return jsonb_build_object('erro', 'valor_invalido');
  end if;
  insert into public.votacao_contribuicoes (rodada, nome, valor, previa)
  values (e.rodada, v_nome, p_valor, coalesce(p_previa, false) and now() < public.votacao_liberacao())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'fim', e.fim, 'rodada', e.rodada);
end $$;

-- ---------------------------------------------------------------------------
-- Recalcula o líder da rodada atual a partir dos pagamentos elegíveis.
-- Maior valor individual (nunca soma pagamentos da mesma pessoa); empate fica
-- com quem teve o pagamento aprovado primeiro (horário oficial do Mercado Pago).
-- Só grava (e só dispara o Realtime) quando o nome muda.
-- ---------------------------------------------------------------------------
create or replace function public.votacao_recalcular_lider()
returns text language plpgsql security definer set search_path = public as $$
declare
  e public.votacao_estado;
  v_lider text;
begin
  select * into e from public.votacao_estado where id = 1 for update;
  select c.nome into v_lider
    from public.votacao_pagamentos p
    join public.votacao_contribuicoes c on c.id = p.contribuicao_id
   where p.elegivel and c.rodada = e.rodada
   order by p.valor_pago desc, p.aprovado_em asc, p.mp_payment_id asc
   limit 1;
  if v_lider is distinct from e.lider_nome then
    update public.votacao_estado set lider_nome = v_lider, atualizado_em = now() where id = 1;
  end if;
  return v_lider;
end $$;

-- ---------------------------------------------------------------------------
-- Registra (ou atualiza) um pagamento consultado na API do Mercado Pago.
-- Idempotente: notificações repetidas do mesmo pagamento só atualizam a linha.
-- Elegível = aprovado, em BRL, valor igual ao escolhido, rodada atual, e
-- horário OFICIAL de aprovação dentro do período da votação — mesmo que o
-- webhook chegue atrasado.
-- ---------------------------------------------------------------------------
create or replace function public.votacao_registrar_pagamento(
  p_payment_id text,
  p_contribuicao uuid,
  p_status text,
  p_status_detalhe text,
  p_valor numeric,
  p_moeda text,
  p_aprovado_em timestamptz
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e public.votacao_estado;
  c public.votacao_contribuicoes;
  v_elegivel boolean := false;
  v_motivo text := null;
  v_lider_antes text;
  v_lider_depois text;
  v_novo boolean;
begin
  if p_payment_id is null or btrim(p_payment_id) = '' then
    return jsonb_build_object('resultado', 'sem_id');
  end if;

  -- serializa todos os registros para o cálculo do líder ser consistente
  select * into e from public.votacao_estado where id = 1 for update;
  v_lider_antes := e.lider_nome;

  select * into c from public.votacao_contribuicoes where id = p_contribuicao;
  if not found then
    return jsonb_build_object('resultado', 'contribuicao_desconhecida');
  end if;

  if p_status <> 'approved' then
    v_motivo := 'status_' || coalesce(p_status, 'desconhecido');
  elsif p_aprovado_em is null then
    v_motivo := 'sem_data_aprovacao';
  elsif coalesce(p_moeda, '') <> 'BRL' then
    v_motivo := 'moeda';
  elsif p_valor is null or abs(p_valor - c.valor) >= 0.005 then
    v_motivo := 'valor_divergente';
  elsif c.rodada <> e.rodada then
    v_motivo := 'rodada_anterior';
  elsif e.inicio is null or p_aprovado_em < e.inicio then
    v_motivo := 'aprovado_antes_do_inicio';
  elsif p_aprovado_em > e.fim then
    v_motivo := 'aprovado_apos_encerramento';
  else
    v_elegivel := true;
  end if;

  insert into public.votacao_pagamentos as p
    (mp_payment_id, contribuicao_id, status, status_detalhe, valor_pago, moeda, aprovado_em, elegivel, motivo)
  values
    (p_payment_id, c.id, p_status, p_status_detalhe, p_valor, p_moeda, p_aprovado_em, v_elegivel, v_motivo)
  on conflict (mp_payment_id) do update
    set status = excluded.status,
        status_detalhe = excluded.status_detalhe,
        valor_pago = excluded.valor_pago,
        moeda = excluded.moeda,
        aprovado_em = excluded.aprovado_em,
        elegivel = excluded.elegivel,
        motivo = excluded.motivo,
        notificacoes = p.notificacoes + 1,
        atualizado_em = now()
  returning (xmax = 0) into v_novo;

  v_lider_depois := public.votacao_recalcular_lider();

  return jsonb_build_object(
    'resultado', case when v_novo then 'registrado' else 'atualizado' end,
    'elegivel', v_elegivel,
    'motivo', v_motivo,
    'lider_mudou', v_lider_antes is distinct from v_lider_depois
  );
end $$;

-- Permissões: só o estado público é executável pela chave publicável.
revoke execute on function public.votacao_estado_publico() from public;
revoke execute on function public.votacao_estado_admin() from public, anon, authenticated;
revoke execute on function public.votacao_admin_ok(text) from public, anon, authenticated;
revoke execute on function public.votacao_iniciar() from public, anon, authenticated;
revoke execute on function public.votacao_reiniciar() from public, anon, authenticated;
revoke execute on function public.votacao_nova_contribuicao(text, numeric, boolean) from public, anon, authenticated;
revoke execute on function public.votacao_recalcular_lider() from public, anon, authenticated;
revoke execute on function public.votacao_registrar_pagamento(text, uuid, text, text, numeric, text, timestamptz) from public, anon, authenticated;

grant execute on function public.votacao_estado_publico() to anon, authenticated, service_role;
grant execute on function public.votacao_estado_admin() to service_role;
grant execute on function public.votacao_admin_ok(text) to service_role;
grant execute on function public.votacao_iniciar() to service_role;
grant execute on function public.votacao_reiniciar() to service_role;
grant execute on function public.votacao_nova_contribuicao(text, numeric, boolean) to service_role;
grant execute on function public.votacao_recalcular_lider() to service_role;
grant execute on function public.votacao_registrar_pagamento(text, uuid, text, text, numeric, text, timestamptz) to service_role;
