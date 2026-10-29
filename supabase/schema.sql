-- Todo 앱 스키마 (Supabase SQL Editor 에 통째로 붙여 넣고 Run)
-- DB_DESIGN.md 의 구조 + 소유 사용자(user_id) + RLS

-- ───────── 표 ─────────

create table public.todos (
    id         bigint generated always as identity primary key,
    user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
    title      text not null check (length(trim(title)) > 0),
    memo       text,
    is_done    boolean not null default false,
    due_date   date,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table public.tags (
    id      bigint generated always as identity primary key,
    user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
    name    text not null,
    color   text,
    unique (user_id, name)  -- 태그 이름은 사용자별로 중복 불가
);

create table public.todo_tags (
    todo_id bigint not null references public.todos (id) on delete cascade,
    tag_id  bigint not null references public.tags (id)  on delete cascade,
    primary key (todo_id, tag_id)
);

create index todos_user_due_idx on public.todos (user_id, due_date);
create index todo_tags_tag_idx  on public.todo_tags (tag_id);

-- ───────── RLS: 로그인한 사용자가 자기 데이터만 ─────────

alter table public.todos     enable row level security;
alter table public.tags      enable row level security;
alter table public.todo_tags enable row level security;

-- todos
create policy "todos: 본인 것만 조회" on public.todos
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "todos: 본인 명의로만 추가" on public.todos
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "todos: 본인 것만 수정" on public.todos
    for update to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "todos: 본인 것만 삭제" on public.todos
    for delete to authenticated using ((select auth.uid()) = user_id);

-- tags
create policy "tags: 본인 것만 조회" on public.tags
    for select to authenticated using ((select auth.uid()) = user_id);
create policy "tags: 본인 명의로만 추가" on public.tags
    for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "tags: 본인 것만 수정" on public.tags
    for update to authenticated
    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "tags: 본인 것만 삭제" on public.tags
    for delete to authenticated using ((select auth.uid()) = user_id);

-- todo_tags: 연결하는 할 일과 태그가 둘 다 본인 것일 때만
create policy "todo_tags: 본인 할 일의 연결만 조회" on public.todo_tags
    for select to authenticated using (
        exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
    );
create policy "todo_tags: 본인 할 일·태그끼리만 연결" on public.todo_tags
    for insert to authenticated with check (
        exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
        and exists (select 1 from public.tags g where g.id = tag_id and g.user_id = (select auth.uid()))
    );
create policy "todo_tags: 본인 할 일의 연결만 삭제" on public.todo_tags
    for delete to authenticated using (
        exists (select 1 from public.todos t where t.id = todo_id and t.user_id = (select auth.uid()))
    );

-- ───────── 함수·트리거 ─────────

-- 수정 시각 자동 갱신
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
    new.updated_at = now();
    return new;
end $$;

create trigger todos_set_updated_at before update on public.todos
    for each row execute function public.set_updated_at();

-- 어떤 할 일에도 안 붙은 태그 정리 (할 일 삭제·태그 변경 후)
create function public.delete_orphan_tags() returns trigger
language plpgsql set search_path = '' as $$
begin
    delete from public.tags g
    where g.user_id = (select auth.uid())
      and not exists (select 1 from public.todo_tags tt where tt.tag_id = g.id);
    return null;
end $$;

create trigger todo_tags_delete_orphans after delete on public.todo_tags
    for each statement execute function public.delete_orphan_tags();

-- 할 일의 태그를 이름 목록으로 통째로 교체 (한 트랜잭션)
-- security invoker: 호출한 사용자 권한으로 실행되므로 RLS 가 그대로 적용됨
create function public.set_todo_tags(p_todo_id bigint, p_names text[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
    delete from public.todo_tags tt
    where tt.todo_id = p_todo_id
      and tt.tag_id not in (
          select g.id from public.tags g
          where g.user_id = (select auth.uid()) and g.name = any (p_names)
      );

    insert into public.tags (name)
    select distinct n from unnest(p_names) as n
    on conflict (user_id, name) do nothing;

    insert into public.todo_tags (todo_id, tag_id)
    select p_todo_id, g.id from public.tags g
    where g.user_id = (select auth.uid()) and g.name = any (p_names)
    on conflict do nothing;
end $$;

revoke execute on function public.set_todo_tags(bigint, text[]) from public, anon;
grant  execute on function public.set_todo_tags(bigint, text[]) to authenticated;
