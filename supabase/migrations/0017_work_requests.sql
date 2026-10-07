-- 업무(TODO·공지·게시판) DB 연결, 신청관리(지출·예산), 부서장 모바일 (2026-10-07)
-- 전제: 0001~0011. 다른 모듈 마이그레이션에 의존하지 않는다.

-- ===== 1. 작성자 기본값 =====
alter table todo alter column user_id set default auth.uid();
alter table notice alter column created_by set default auth.uid();
alter table notice alter column published_at set default now();   -- 저장하면 바로 게시
alter table expense_request alter column requested_by set default auth.uid();
alter table budget_request alter column requested_by set default auth.uid();

-- ===== 2. 재정부게시판: 작성자 이름을 글에 남긴다 =====
-- app_user는 본인·관리자만 읽을 수 있어서, 재정부원끼리 이름이 보이도록 글에 이름을 저장한다.
alter table board_post add column if not exists author_name text;
create or replace function public.board_post_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.author_name := (select name from app_user where id = auth.uid());  -- 본인 행은 읽을 수 있다
    new.created_at := now();
  else  -- 작성자·작성일은 바꿀 수 없다
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.created_at := old.created_at;
    new.updated_at := now();
  end if;
  return new;
end $$;
revoke execute on function public.board_post_stamp() from public, anon, authenticated;
create trigger board_post_stamp before insert or update on board_post for each row execute function public.board_post_stamp();

-- ===== 3. 부서장 ↔ 부서: 연결된 부서의 예산·항목만 읽기 =====
create or replace function public.my_department_ids() returns setof int
language sql stable security definer set search_path = public as $$
  select ud.department_id from user_department ud
  where ud.user_id = auth.uid() and public.my_role() is not null
$$;
-- RLS 정책 안에서 쓰므로 실행 권한은 둔다(비로그인·미승인은 빈 결과)

create policy user_department_self_read on user_department for select using (user_id = auth.uid());
create policy department_dept_head_read on department for select using (id in (select public.my_department_ids()));
create policy expense_item_dept_head_read on expense_item for select using (department_id in (select public.my_department_ids()));
create policy budget_dept_head_read on budget for select
  using (expense_item_id in (select ei.id from expense_item ei where ei.department_id in (select public.my_department_ids())));

-- 지출(expense)은 청구자·계좌가 있어 표로 열지 않고, 아래 함수로 필요한 칸만 준다.
-- 항목별 예산·지출 합계 (재정부원은 전체 부서)
create or replace function public.dept_budget_status(p_year int)
returns table (department_id int, department text, dept_order int, expense_item_id int, item text, item_order int, budget bigint, spent bigint)
language sql stable security definer set search_path = public as $$
  select d.id, d.name, d.sort_order, ei.id, ei.name, ei.sort_order,
         coalesce((select sum(b.amount) from budget b where b.expense_item_id = ei.id and b.year = p_year), 0)::bigint,
         coalesce((select sum(e.amount) from expense e join week w on w.id = e.week_id
                   where e.expense_item_id = ei.id and w.year = p_year), 0)::bigint
  from department d join expense_item ei on ei.department_id = d.id
  where public.is_finance() or d.id in (select public.my_department_ids())
  order by d.sort_order, d.id, ei.sort_order, ei.id
$$;
-- 부서 지출 내역: 일자·항목·내용·금액·비고 (청구자·계좌 제외)
create or replace function public.dept_expenses(p_year int, p_department_id int)
returns table (id bigint, sunday date, expense_item_id int, item text, content text, amount bigint, memo text)
language sql stable security definer set search_path = public as $$
  select e.id, w.sunday, ei.id, ei.name, e.content, e.amount, e.memo
  from expense e join week w on w.id = e.week_id join expense_item ei on ei.id = e.expense_item_id
  where w.year = p_year and ei.department_id = p_department_id
    and (public.is_finance() or p_department_id in (select public.my_department_ids()))
  order by w.sunday desc, e.sort_order, e.id
$$;
revoke execute on function public.dept_budget_status(int) from public, anon;
revoke execute on function public.dept_expenses(int, int) from public, anon;
grant execute on function public.dept_budget_status(int) to authenticated;
grant execute on function public.dept_expenses(int, int) to authenticated;

-- ===== 4. 신청: 신청자 이름, 본인 송금 계좌 =====
alter table expense_request add column if not exists requester_name text;
alter table budget_request add column if not exists requester_name text;
alter table payee add column if not exists user_id uuid references app_user(id) on delete set null; -- 신청자 본인 계좌
-- 신청자는 자기가 올린 영수증 행(드라이브 파일 ID)만 본다
create policy receipt_file_uploader_read on receipt_file for select using (uploaded_by = auth.uid());
-- 주간 지출 저장은 그 주 지출을 지웠다 다시 넣는다 → 신청과의 연결만 끊기고 저장은 되게
alter table expense_request drop constraint if exists expense_request_expense_id_fkey;
alter table expense_request add constraint expense_request_expense_id_fkey
  foreign key (expense_id) references expense(id) on delete set null;

-- 신청자(재정부원이 아님)는 검토 전 신청만, 자기 부서로만, 상태는 못 바꾼다.
-- 0009 정책(본인 신청 for all)을 보완한다. 신청자 이름은 회원 이름으로 고정.
create or replace function public.guard_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb;
begin
  if tg_op = 'INSERT' then
    new.requester_name := (select name from app_user where id = new.requested_by);
    new.requested_at := now();
  elsif tg_op = 'UPDATE' then
    new.requested_by := old.requested_by;
    new.requested_at := old.requested_at;
    new.requester_name := old.requester_name;
  end if;
  if public.is_finance() then return coalesce(new, old); end if;

  if tg_op <> 'INSERT' and old.status <> 'requested' then
    raise exception '검토가 끝난 신청은 바꿀 수 없어요';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  j := to_jsonb(new);
  if new.status <> 'requested' or new.reviewed_by is not null or new.reviewed_at is not null
     or new.review_note is not null or (j->>'expense_id') is not null then
    raise exception '신청 상태는 재정부만 바꿀 수 있어요';
  end if;
  if new.department_id is not null and new.department_id not in (select public.my_department_ids()) then
    raise exception '내 부서로만 신청할 수 있어요';
  end if;
  if new.expense_item_id is not null and not exists
     (select 1 from expense_item ei where ei.id = new.expense_item_id and ei.department_id = new.department_id) then
    raise exception '그 부서의 항목이 아니에요';
  end if;
  if tg_table_name = 'expense_request' then  -- 남의 계좌·영수증을 끌어다 쓰지 못하게
    if (j->>'payee_id') is not null and not exists
       (select 1 from payee p where p.id = (j->>'payee_id')::bigint and p.user_id = auth.uid()) then
      raise exception '내 계좌만 쓸 수 있어요';
    end if;
    if (j->>'receipt_file_id') is not null and (tg_op = 'INSERT' or (j->>'receipt_file_id') is distinct from (to_jsonb(old)->>'receipt_file_id'))
       and not exists (select 1 from receipt_file f where f.id = (j->>'receipt_file_id')::bigint and f.uploaded_by = auth.uid()) then
      raise exception '내가 올린 영수증만 쓸 수 있어요';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_request() from public, anon, authenticated;
create trigger expense_request_guard before insert or update or delete on expense_request
  for each row execute function public.guard_request();
create trigger budget_request_guard before insert or update or delete on budget_request
  for each row execute function public.guard_request();
create trigger expense_request_audit after insert or update or delete on expense_request for each row execute function public.write_audit();
create trigger budget_request_audit after insert or update or delete on budget_request for each row execute function public.write_audit();

-- 지출신청 저장(새로/수정): 송금 계좌는 암호화해서 신청자 본인 계좌(payee.user_id)로 저장
-- 계좌번호를 비우면 이 신청의 기존 계좌 → 내가 마지막에 쓴 계좌 순으로 쓴다.
create or replace function public.save_expense_request(
  p_id bigint, p_department_id int, p_content text, p_amount bigint, p_used_at date,
  p_drive_file_id text default null, p_bank text default null, p_account_no text default null, p_holder text default null)
returns bigint
language plpgsql security definer set search_path = public, private, extensions as $$
declare r expense_request; pid bigint; fid bigint; acct text; role text := public.my_role();
begin
  if role is null or role not in ('dept_head', 'pastor', 'admin') then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p_content), '') = '' then raise exception '내용을 입력해 주세요'; end if;
  if p_amount is null or p_amount <= 0 then raise exception '금액을 입력해 주세요'; end if;
  if role = 'dept_head' and p_department_id is null then raise exception '부서를 골라 주세요'; end if;
  if p_id is not null then
    select * into r from expense_request where id = p_id and requested_by = auth.uid() for update;
    if not found then raise exception '신청을 찾을 수 없어요'; end if;
    if r.status <> 'requested' then raise exception '검토가 끝난 신청은 바꿀 수 없어요'; end if;
  end if;

  acct := regexp_replace(coalesce(p_account_no, ''), '[^0-9-]', '', 'g');
  if acct <> '' then
    if coalesce(trim(p_bank), '') = '' then raise exception '은행을 입력해 주세요'; end if;
    if length(regexp_replace(acct, '-', '', 'g')) < 8 then raise exception '계좌번호를 확인해 주세요'; end if;
    insert into payee (name, bank, account_no_enc, holder, memo, user_id)
    values (nullif(trim(p_holder), ''), trim(p_bank), pgp_sym_encrypt(acct, (select k from private.app_key)),
            nullif(trim(p_holder), ''), '지출신청', auth.uid())
    returning id into pid;
  else
    pid := coalesce(r.payee_id, (select p.id from payee p where p.user_id = auth.uid() order by p.id desc limit 1));
  end if;

  if coalesce(p_drive_file_id, '') <> '' then
    if p_drive_file_id !~ '^[\w-]{10,}$' then raise exception '영수증 파일이 올바르지 않아요'; end if;
    select id into fid from receipt_file where drive_file_id = p_drive_file_id;
    if fid is null then
      insert into receipt_file (drive_file_id, uploaded_by) values (p_drive_file_id, auth.uid()) returning id into fid;
    elsif fid is distinct from r.receipt_file_id then
      raise exception '이미 등록된 영수증 파일이에요';
    end if;
  else
    fid := r.receipt_file_id;
  end if;

  if p_id is null then
    insert into expense_request (department_id, content, amount, used_at, receipt_file_id, payee_id, requested_by)
    values (p_department_id, trim(p_content), p_amount, p_used_at, fid, pid, auth.uid())
    returning id into p_id;
  else
    update expense_request set department_id = p_department_id, content = trim(p_content), amount = p_amount,
           used_at = p_used_at, receipt_file_id = fid, payee_id = pid
    where id = p_id;
  end if;
  return p_id;
end $$;
revoke execute on function public.save_expense_request(bigint, int, text, bigint, date, text, text, text, text) from public, anon;
grant execute on function public.save_expense_request(bigint, int, text, bigint, date, text, text, text, text) to authenticated;

-- 내 송금 계좌(가린 번호): 지정한 내 계좌, 없으면 마지막에 쓴 계좌
create or replace function public.my_payee(p_payee_id bigint default null)
returns table (id bigint, bank text, holder text, account text)
language sql stable security definer set search_path = public, private, extensions as $$
  select p.id, p.bank, p.holder,
         regexp_replace(pgp_sym_decrypt(p.account_no_enc, (select k from private.app_key)), '\d(?=[\d-]{4})', '*', 'g')
  from payee p
  where p.user_id = auth.uid() and public.my_role() is not null and (p_payee_id is null or p.id = p_payee_id)
  order by p.id desc limit 1
$$;
revoke execute on function public.my_payee(bigint) from public, anon;
grant execute on function public.my_payee(bigint) to authenticated;

-- ===== 5. 재정부 검토 =====
-- 관리 목록용 보기(호출자 권한: 재정부원은 전체, 신청자는 자기 것·계좌 칸은 비어 보임)
create or replace view public.v_expense_request with (security_invoker = true) as
select r.id, r.status::text as status, r.department_id, d.name as department, r.expense_item_id, ei.name as item,
       r.content, r.amount, r.used_at, r.requested_by, r.requester_name, r.requested_at,
       r.reviewed_at, r.review_note, r.expense_id, w.sunday as expense_sunday,
       r.payee_id, p.bank, p.holder, public.mask(p.account_no_enc, 'account') as account_masked,
       rf.drive_file_id
from expense_request r
left join department d on d.id = r.department_id
left join expense_item ei on ei.id = r.expense_item_id
left join payee p on p.id = r.payee_id
left join receipt_file rf on rf.id = r.receipt_file_id
left join expense e on e.id = r.expense_id
left join week w on w.id = e.week_id;

-- 송금용 전체 계좌번호(재정부원만, 조회 기록 남김)
create or replace function public.expense_request_account(p_id bigint) returns text
language plpgsql set search_path = public as $$
declare acct text;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select public.dec(p.account_no_enc) into acct from expense_request r join payee p on p.id = r.payee_id where r.id = p_id;
  perform public.log_event('view_account', 'expense_request:' || p_id);
  return acct;
end $$;
revoke execute on function public.expense_request_account(bigint) from public, anon;

-- 승인일(한국 시각) 기준 이번 주일 = 직전 주일(오늘이 주일이면 오늘). 화면의 기본 주일과 같다.
create or replace function public.request_sunday() returns date
language sql stable set search_path = public as $$
  select d - extract(dow from d)::int from (select (now() at time zone 'Asia/Seoul')::date as d) x
$$;

-- 승인: 항목 지정 → 그 주일 지출로 넣는다(출처 '신청', 청구자 = 신청자 이름)
create or replace function public.approve_expense_request(p_id bigint, p_expense_item_id int, p_sunday date default null, p_note text default null)
returns bigint
language plpgsql set search_path = public as $$
declare r expense_request; dep int; wid int; eid bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select * into r from expense_request where id = p_id for update;
  if not found then raise exception '신청을 찾을 수 없어요'; end if;
  if r.status <> 'requested' then raise exception '이미 처리된 신청이에요'; end if;
  select department_id into dep from expense_item where id = p_expense_item_id;
  if dep is null then raise exception '부서·항목을 골라 주세요'; end if;

  wid := public.week_for(coalesce(p_sunday, public.request_sunday()));
  insert into expense (week_id, expense_item_id, content, amount, payee_id, method, receipt_file_id,
                       requester_label, memo, source, sort_order, created_by)
  values (wid, p_expense_item_id, r.content, r.amount, r.payee_id, case when r.payee_id is not null then '송금' end,
          r.receipt_file_id, r.requester_name,
          case when r.used_at is not null then '사용일 ' || to_char(r.used_at, 'YYYY-MM-DD') end, '신청',
          (select coalesce(max(x.sort_order), 0) + 1 from expense x where x.week_id = wid), auth.uid())
  returning id into eid;
  update expense_request
     set department_id = dep, expense_item_id = p_expense_item_id, status = 'approved',
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), ''), expense_id = eid
   where id = p_id;
  return eid;
end $$;

create or replace function public.reject_expense_request(p_id bigint, p_note text) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception '반려 사유를 입력해 주세요'; end if;
  update expense_request set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = trim(p_note)
   where id = p_id and status = 'requested';
  if not found then raise exception '처리할 신청이 없어요'; end if;
end $$;

-- 예산신청: 승인/반려만 기록(내년도 예산 화면이 승인 건을 참고)
create or replace function public.review_budget_request(p_id bigint, p_approve boolean, p_note text default null) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then raise exception '반려 사유를 입력해 주세요'; end if;
  update budget_request
     set status = case when p_approve then 'approved' else 'rejected' end::request_status,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(trim(p_note), '')
   where id = p_id and status = 'requested';
  if not found then raise exception '처리할 신청이 없어요'; end if;
end $$;

revoke execute on function public.request_sunday() from public, anon;
revoke execute on function public.approve_expense_request(bigint, int, date, text) from public, anon;
revoke execute on function public.reject_expense_request(bigint, text) from public, anon;
revoke execute on function public.review_budget_request(bigint, boolean, text) from public, anon;
grant execute on function public.request_sunday() to authenticated;
grant execute on function public.approve_expense_request(bigint, int, date, text) to authenticated;
grant execute on function public.reject_expense_request(bigint, text) to authenticated;
grant execute on function public.review_budget_request(bigint, boolean, text) to authenticated;
grant execute on function public.expense_request_account(bigint) to authenticated;
revoke all on public.v_expense_request from anon;
