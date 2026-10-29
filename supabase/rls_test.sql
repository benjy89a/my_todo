-- RLS 확인용 테스트 (schema.sql 실행 후, SQL Editor 에 붙여 넣고 Run)
-- 가짜 사용자 A·B 를 만들어 시험하고, 마지막에 rollback 해서 아무것도 남기지 않음.
-- 성공하면 결과에 'RLS 테스트 통과' 가 보이고, 실패하면 어떤 검사가 실패했는지 오류로 보임.

begin;

insert into auth.users (id, email) values
    ('00000000-0000-0000-0000-00000000000a', 'rls-test-a@example.com'),
    ('00000000-0000-0000-0000-00000000000b', 'rls-test-b@example.com');

-- 사용자 A 로 로그인한 상태
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
set local role authenticated;

insert into public.todos (title) values ('A의 할 일');
select public.set_todo_tags((select id from public.todos where title = 'A의 할 일'), array['A태그']);

do $$
declare n int;
begin
    select count(*) into n from public.todos;
    if n <> 1 then raise exception 'A가 자기 할 일을 못 봄 (%건)', n; end if;
    select count(*) into n from public.tags;
    if n <> 1 then raise exception 'A가 자기 태그를 못 봄 (%건)', n; end if;
end $$;

-- 사용자 B 로 바꿈
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);

do $$
declare n int;
begin
    select count(*) into n from public.todos;
    if n <> 0 then raise exception 'B가 A의 할 일을 봄'; end if;
    select count(*) into n from public.tags;
    if n <> 0 then raise exception 'B가 A의 태그를 봄'; end if;
    select count(*) into n from public.todo_tags;
    if n <> 0 then raise exception 'B가 A의 태그 연결을 봄'; end if;

    update public.todos set title = '해킹';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B가 A의 할 일을 수정함'; end if;

    delete from public.todos;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'B가 A의 할 일을 삭제함'; end if;

    begin
        insert into public.todos (title, user_id) values ('가짜', '00000000-0000-0000-0000-00000000000a');
        raise exception 'B가 A 명의로 할 일을 추가함';
    exception when insufficient_privilege then null;  -- 막혀야 정상
    end;
end $$;

-- 로그인 안 한 상태(anon)
reset role;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare n int;
begin
    select count(*) into n from public.todos;
    if n <> 0 then raise exception '로그인 안 한 사용자가 할 일을 봄'; end if;
    begin
        insert into public.todos (title) values ('익명');
        raise exception '로그인 안 한 사용자가 할 일을 추가함';
    exception when insufficient_privilege or not_null_violation then null;  -- 막혀야 정상
    end;
end $$;

reset role;
select 'RLS 테스트 통과' as result;

rollback;
