-- 기부금영수증: 교회 정보 이미지, 양식 메모, 발행번호 원자 부여, 발행·수정·취소·재발행, 공개 신청 (2026-10-07)
-- 전제: 0001~0011. 주민번호는 평문 저장 금지(enc/pgp_sym_encrypt), 화면엔 mask.

-- ===== 1. 발행자(교회) 정보: 직인·간인 이미지는 작은 data URL(200KB 이하)로 DB에 =====
alter table church_info
  add column if not exists seal_image text,     -- 직인 data:image/...;base64
  add column if not exists stamp_image text,    -- 간인
  add column if not exists phone text,
  add column if not exists updated_at timestamptz default now();
-- base64는 원본보다 약 4/3 커진다: 200KB → 약 273,000자
alter table church_info add constraint church_info_seal_image_chk
  check (seal_image is null or (seal_image like 'data:image/%;base64,%' and length(seal_image) <= 280000));
alter table church_info add constraint church_info_stamp_image_chk
  check (stamp_image is null or (stamp_image like 'data:image/%;base64,%' and length(stamp_image) <= 280000));
alter table church_info add constraint church_info_single check (id = 1);
insert into church_info (id) values (1) on conflict do nothing;

-- ===== 2. 양식: 파일 대신 메모 + 기본 양식 =====
alter table receipt_form
  add column if not exists memo text,           -- [확인 필요: 정부 양식 파일]
  add column if not exists is_default boolean not null default false,
  add column if not exists created_at timestamptz default now();
create unique index if not exists receipt_form_one_default on receipt_form (is_default) where is_default;
insert into receipt_form (name, version, active, is_default, memo)
select '기부금 영수증(소득세법 시행규칙 별지 제45호의2)', 'HTML v1', true, true,
       '화면 HTML 서식. 항목 구성만 맞춤 [확인 필요: 정부 양식 파일·최신 개정일]'
where not exists (select 1 from receipt_form where is_default);

-- ===== 3. 영수증 =====
-- year = 기부 연도(donation_year와 같게 저장). 발행번호 앞 연도도 기부 연도 [확인 필요]
alter table donation_receipt
  add column if not exists request_id bigint references donation_request(id),
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz;
create index if not exists donation_receipt_year on donation_receipt (year);
create index if not exists donation_receipt_member on donation_receipt (member_id);

-- 화면용 뷰: 주민번호는 마스킹·앞 6자리만 (호출자 권한 = RLS)
create or replace view public.v_donation_receipt with (security_invoker = true) as
select r.id, r.year, r.donation_year, r.serial_no, r.donor_kind, r.member_id, r.donor_name,
       public.mask(r.donor_rrn_enc) as donor_rrn_masked,
       left(public.dec(r.donor_rrn_enc), 6) as rrn_front,
       r.donor_rrn_enc is not null as has_rrn,
       r.donor_address, r.donor_brn, r.donor_rep_name,
       r.total_amount, r.issued_amount, r.adjustment_amount, r.adjustment_reason,
       r.split_group, r.split_ratio, r.status, r.reissue_of_id, r.detail, r.memo,
       r.form_id, r.issued_at, r.issued_by, r.request_id, r.created_at, r.updated_at
from donation_receipt r;

-- ===== 4. 발행번호: {연도}-{PN|CP}{일련3}-{MMDD}, 연도·구분별 잠금으로 중복 방지 =====
create or replace function public.next_receipt_no(p_year int, p_kind text, p_issued date) returns text
language plpgsql set search_path = public as $$
declare n int;
begin
  if p_kind not in ('PN', 'CP') then raise exception '개인(PN)·법인(CP)만 가능합니다'; end if;
  perform pg_advisory_xact_lock(hashtext('donation_receipt_no'), p_year * 10 + (p_kind = 'CP')::int);
  select coalesce(max(substring(serial_no from '^\d{4}-(?:PN|CP)(\d+)-')::int), 0) + 1 into n
  from donation_receipt where serial_no like p_year || '-' || p_kind || '%';
  return p_year || '-' || p_kind || case when n < 1000 then lpad(n::text, 3, '0') else n::text end
         || '-' || to_char(p_issued, 'MMDD');
end $$;
revoke execute on function public.next_receipt_no(int, text, date) from public, anon;

-- 한 건 행 넣기(내부용). 주민번호: 새 입력 > 지난 영수증 > 신청서 > 교인정보 순
create or replace function public.insert_receipt_row(r jsonb, p_group uuid, p_issued date) returns bigint
language plpgsql set search_path = public as $$
declare
  y int := (r->>'donation_year')::int;
  kind text := coalesce(nullif(r->>'donor_kind', ''), 'PN');
  rid bigint; rrn bytea;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if y is null or y < 2000 or y > extract(year from p_issued)::int then raise exception '기부 연도를 확인해 주세요'; end if;
  if coalesce(trim(r->>'donor_name'), '') = '' then raise exception '기부자 성명을 넣어 주세요'; end if;
  if coalesce((r->>'issued_amount')::bigint, -1) < 0 then raise exception '발행금액을 확인해 주세요'; end if;
  if kind = 'PN' then
    if coalesce(r->>'donor_rrn', '') <> '' and r->>'donor_rrn' !~ '^\d{6}-\d{7}$' then raise exception '주민번호 형식을 확인해 주세요'; end if;
    rrn := coalesce(public.enc(nullif(r->>'donor_rrn', '')),
      (select donor_rrn_enc from donation_receipt where id = nullif(r->>'rrn_from_receipt_id', '')::bigint),
      (select rrn_enc from donation_request where id = nullif(r->>'request_id', '')::bigint),
      (select rrn_enc from member where id = nullif(r->>'member_id', '')::bigint));
  elsif coalesce(r->>'donor_brn', '') !~ '^\d{3}-\d{2}-\d{5}$' then
    raise exception '사업자번호 형식을 확인해 주세요';
  end if;

  insert into donation_receipt (year, donation_year, serial_no, donor_kind, member_id, donor_name, donor_rrn_enc,
    donor_address, donor_brn, donor_rep_name, total_amount, issued_amount, adjustment_amount, adjustment_reason,
    split_group, split_ratio, status, reissue_of_id, detail, memo, form_id, issued_at, issued_by, request_id)
  values (y, y, public.next_receipt_no(y, kind, p_issued), kind, nullif(r->>'member_id', '')::bigint, trim(r->>'donor_name'), rrn,
    nullif(r->>'donor_address', ''), case when kind = 'CP' then r->>'donor_brn' end,
    case when kind = 'CP' then nullif(r->>'donor_rep_name', '') end,
    coalesce((r->>'total_amount')::bigint, 0), (r->>'issued_amount')::bigint,
    coalesce((r->>'adjustment_amount')::bigint, 0), nullif(r->>'adjustment_reason', ''),
    p_group, nullif(r->>'split_ratio', '')::numeric, 'issued', nullif(r->>'reissue_of_id', '')::bigint,
    r->'detail', nullif(r->>'memo', ''),
    coalesce(nullif(r->>'form_id', '')::int, (select id from receipt_form where is_default)),
    p_issued, auth.uid(), nullif(r->>'request_id', '')::bigint)
  returning id into rid;

  insert into donation_receipt_source (receipt_id, payer_label, amount)
  select rid, s->>'payer_label', sum((s->>'amount')::bigint)
  from jsonb_array_elements(case when jsonb_typeof(r->'sources') = 'array' then r->'sources' else '[]' end) s
  where coalesce(s->>'payer_label', '') <> ''
  group by s->>'payer_label';
  return rid;
end $$;
revoke execute on function public.insert_receipt_row(jsonb, uuid, date) from public, anon;

-- 발행: rows 1건(단독) 또는 여러 건(부부 비율 분할, 같은 split_group). 재발행이면 원본을 reissued로.
-- rows: [{donation_year, donor_kind, member_id, donor_name, donor_rrn, rrn_from_receipt_id, donor_address,
--         donor_brn, donor_rep_name, total_amount, issued_amount, adjustment_amount, adjustment_reason,
--         split_ratio, detail, sources:[{payer_label, amount}], memo, form_id, request_id, reissue_of_id}]
create or replace function public.issue_donation_receipts(p_rows jsonb, p_issued date default null)
returns setof donation_receipt
language plpgsql set search_path = public as $$
declare
  d date := coalesce(p_issued, (now() at time zone 'Asia/Seoul')::date);
  g uuid; r jsonb; ids bigint[] := '{}'; olds bigint[] := '{}'; old_id bigint; req_id bigint;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception '발행할 내용이 없습니다'; end if;
  if jsonb_array_length(p_rows) > 1 then g := gen_random_uuid(); end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    old_id := nullif(r->>'reissue_of_id', '')::bigint;
    if old_id is not null then
      if not old_id = any(olds) then  -- 분할 재발행이면 원본은 한 번만 바꾼다
        update donation_receipt set status = 'reissued', updated_at = now() where id = old_id and status = 'issued';
        if not found then raise exception '발행 상태인 영수증만 재발행할 수 있습니다'; end if;
        olds := olds || old_id;
      end if;
      -- 새 주민번호를 안 넣으면 원본 것을 쓴다
      if coalesce(r->>'donor_rrn', '') = '' and coalesce(r->>'rrn_from_receipt_id', '') = '' then
        r := r || jsonb_build_object('rrn_from_receipt_id', old_id);
      end if;
    end if;
    ids := ids || public.insert_receipt_row(r, g, d);
    req_id := coalesce(req_id, nullif(r->>'request_id', '')::bigint);
  end loop;

  if req_id is not null then
    update donation_request set status = 'done', donation_receipt_id = ids[1],
           reviewed_by = auth.uid(), reviewed_at = now()
    where id = req_id;
  end if;
  return query select * from donation_receipt where id = any(ids) order by id;
end $$;
revoke execute on function public.issue_donation_receipts(jsonb, date) from public, anon;

-- 수정: 발행번호·구분·연도는 그대로, 기부자·금액·내용만. 주민번호는 새로 넣을 때만 바꾼다.
create or replace function public.update_donation_receipt(p_id bigint, r jsonb) returns donation_receipt
language plpgsql set search_path = public as $$
declare x donation_receipt;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select * into x from donation_receipt where id = p_id for update;
  if not found then raise exception '영수증을 찾을 수 없습니다'; end if;
  if x.status <> 'issued' then raise exception '발행 상태인 영수증만 고칠 수 있습니다'; end if;
  if coalesce(trim(r->>'donor_name'), '') = '' then raise exception '기부자 성명을 넣어 주세요'; end if;
  if coalesce((r->>'issued_amount')::bigint, -1) < 0 then raise exception '발행금액을 확인해 주세요'; end if;
  if coalesce(r->>'donor_rrn', '') <> '' and r->>'donor_rrn' !~ '^\d{6}-\d{7}$' then raise exception '주민번호 형식을 확인해 주세요'; end if;
  if x.donor_kind = 'CP' and coalesce(r->>'donor_brn', '') !~ '^\d{3}-\d{2}-\d{5}$' then raise exception '사업자번호 형식을 확인해 주세요'; end if;

  update donation_receipt set
    member_id = nullif(r->>'member_id', '')::bigint,
    donor_name = trim(r->>'donor_name'),
    donor_rrn_enc = case when x.donor_kind = 'PN' then coalesce(public.enc(nullif(r->>'donor_rrn', '')), donor_rrn_enc) end,
    donor_address = nullif(r->>'donor_address', ''),
    donor_brn = case when x.donor_kind = 'CP' then r->>'donor_brn' end,
    donor_rep_name = case when x.donor_kind = 'CP' then nullif(r->>'donor_rep_name', '') end,
    total_amount = coalesce((r->>'total_amount')::bigint, total_amount),
    issued_amount = (r->>'issued_amount')::bigint,
    adjustment_amount = coalesce((r->>'adjustment_amount')::bigint, 0),
    adjustment_reason = nullif(r->>'adjustment_reason', ''),
    split_ratio = case when r ? 'split_ratio' then nullif(r->>'split_ratio', '')::numeric else split_ratio end,
    detail = coalesce(r->'detail', detail),
    memo = nullif(r->>'memo', ''),
    updated_at = now()
  where id = p_id returning * into x;

  if jsonb_typeof(r->'sources') = 'array' then
    delete from donation_receipt_source where receipt_id = p_id;
    insert into donation_receipt_source (receipt_id, payer_label, amount)
    select p_id, s->>'payer_label', sum((s->>'amount')::bigint)
    from jsonb_array_elements(r->'sources') s where coalesce(s->>'payer_label', '') <> ''
    group by s->>'payer_label';
  end if;
  return x;
end $$;
revoke execute on function public.update_donation_receipt(bigint, jsonb) from public, anon;

create or replace function public.cancel_donation_receipt(p_id bigint, p_reason text) returns void
language plpgsql set search_path = public as $$
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '취소 사유를 넣어 주세요'; end if;
  update donation_receipt set status = 'canceled', canceled = true, updated_at = now(),
         memo = concat_ws(' / ', memo, '취소: ' || trim(p_reason))
  where id = p_id and status = 'issued';
  if not found then raise exception '발행 상태인 영수증만 취소할 수 있습니다'; end if;
end $$;
revoke execute on function public.cancel_donation_receipt(bigint, text) from public, anon;

-- 출력용 주민번호 전체(재정부원만, 사용내역에 남김)
create or replace function public.receipt_rrn(p_id bigint) returns text
language plpgsql set search_path = public as $$
declare v text;
begin
  if not public.is_finance() then raise exception '권한이 없습니다'; end if;
  select public.dec(donor_rrn_enc) into v from donation_receipt where id = p_id;
  perform public.log_event('rrn_view', 'donation_receipt:' || p_id);
  return v;
end $$;
revoke execute on function public.receipt_rrn(bigint) from public, anon;

-- 기부자 찾기: 교인(가족 포함) + 마스킹 주민번호
create or replace function public.receipt_donor_search(p_q text)
returns table (member_id bigint, name text, title text, household_id bigint, household_label text,
               is_household_head boolean, address text, phone text, rrn_masked text, family text[])
language sql stable set search_path = public as $$
  select m.id, m.name || coalesce(m.name_suffix, ''), m.title, m.household_id, h.label,
         coalesce(m.is_household_head, false), m.address, m.phone, public.mask(m.rrn_enc),
         array(select f.name || coalesce(f.name_suffix, '') from member f
               where f.household_id = m.household_id and f.id <> m.id order by f.is_household_head desc, f.id)
  from member m left join household h on h.id = m.household_id
  where public.is_finance() and length(trim(p_q)) >= 1 and m.name like '%' || trim(p_q) || '%'
    and not coalesce(m.exclude_from_receipt, false)
  order by m.name, m.id limit 30
$$;
revoke execute on function public.receipt_donor_search(text) from public, anon;

-- ===== 5. 기부금영수증 신청(공개) =====
alter table donation_request
  add column if not exists fp_hash text;         -- 브라우저 지문 해시(IP는 클라이언트에서 못 얻음) [확인 필요]
comment on column donation_request.ip_hash is '쓰지 않음: 공개 RPC는 IP를 알 수 없다(fp_hash 사용)';

-- 재정부원만 읽기·수정(검토·반려·교인 연결). 넣기는 공개 RPC로만, 지우기는 [확인 필요: 보관기간]
create policy donation_request_finance_read on donation_request for select using (public.is_finance());
create policy donation_request_finance_update on donation_request for update using (public.is_finance()) with check (public.is_finance());

create or replace view public.v_donation_request with (security_invoker = true) as
select q.id, 'D' || to_char(q.created_at at time zone 'Asia/Seoul', 'YYMMDD') || '-' || lpad(q.id::text, 4, '0') as request_no,
       q.year, q.name, public.mask(q.rrn_enc) as rrn_masked, q.rrn_enc is not null as has_rrn,
       q.phone, q.address, q.request_note, q.family_names, q.is_returning, q.pickup,
       q.member_id, m.name || coalesce(m.name_suffix, '') as member_name, m.household_id,
       q.status::text as status, q.donation_receipt_id, r.serial_no, q.verified_by,
       q.created_at, q.reviewed_at, q.review_note
from donation_request q
left join member m on m.id = q.member_id
left join donation_receipt r on r.id = q.donation_receipt_id;

-- 공개 RPC 전용 암호화(anon은 enc를 못 쓴다). private 스키마라 API로 노출되지 않는다.
create or replace function private.enc_public(p text) returns bytea
language sql stable security definer set search_path = public, private, extensions as $$
  select pgp_sym_encrypt(p, (select k from private.app_key))
$$;
revoke execute on function private.enc_public(text) from public, anon, authenticated;

-- 횟수 제한: key별 1시간 창. 넘으면 false (예외를 던지면 카운트까지 되돌아가므로 값으로 알린다)
create or replace function private.hit_rate_limit(p_key text, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare c int;
begin
  insert into request_rate_limit as t (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when t.window_start < now() - interval '1 hour' then 1 else t.count + 1 end,
    window_start = case when t.window_start < now() - interval '1 hour' then now() else t.window_start end
  returning count into c;
  return c <= p_max;
end $$;
revoke execute on function private.hit_rate_limit(text, int) from public, anon, authenticated;

-- 공개 신청: anon이 부를 수 있는 유일한 입구. 결과는 {ok, request_no} 또는 {ok:false, error}.
-- 이전 신청자는 성명+휴대폰 일치로 지난 주민번호·주소를 서버에서만 이어 쓴다(화면에 돌려주지 않음).
-- p: {name, rrn, phone, address, note, family_names, consent, returning, year, website(honeypot), fp}
create or replace function public.submit_donation_request(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, private, extensions as $$
declare
  ph text := regexp_replace(coalesce(p->>'phone', ''), '\D', '', 'g');
  fp text := left(regexp_replace(lower(coalesce(p->>'fp', '')), '[^0-9a-f]', '', 'g'), 64);
  nm text; rrn text; ret boolean; y int; this_year int; ok boolean;
  prev_rrn bytea; prev_addr text; prev_member bigint; mid bigint; nid bigint; fam text[];
begin
  -- 봇: 숨김 칸이 채워지면 저장하지 않는다
  if coalesce(p->>'website', '') <> '' then return jsonb_build_object('ok', false, 'error', '잠시 후 다시 시도해 주세요'); end if;
  if ph !~ '^01\d{8,9}$' then return jsonb_build_object('ok', false, 'error', '휴대폰번호를 확인해 주세요'); end if;

  -- 횟수 제한: 전화번호별 1시간 5회, 브라우저별 10회, 전체 200회 [확인 필요]
  ok := private.hit_rate_limit('phone:' || ph, 5);
  ok := private.hit_rate_limit('all', 200) and ok;
  if fp <> '' then ok := private.hit_rate_limit('fp:' || fp, 10) and ok; end if;
  if not ok then return jsonb_build_object('ok', false, 'error', '요청이 너무 많아요. 1시간 뒤 다시 시도해 주세요'); end if;

  -- 아래에서 실패해도 횟수는 남도록 하위 블록에서 처리
  begin
    nm := regexp_replace(trim(coalesce(p->>'name', '')), '\s+', ' ', 'g');
    rrn := regexp_replace(coalesce(p->>'rrn', ''), '\D', '', 'g');
    ret := coalesce((p->>'returning')::boolean, false);
    this_year := extract(year from now() at time zone 'Asia/Seoul')::int;
    y := coalesce(nullif(p->>'year', '')::int, this_year - 1); -- 기본: 지난해 기부분 [확인 필요]

    if length(nm) < 2 or length(nm) > 30 then return jsonb_build_object('ok', false, 'error', '성명을 확인해 주세요'); end if;
    if not coalesce((p->>'consent')::boolean, false) then return jsonb_build_object('ok', false, 'error', '개인정보 수집·이용에 동의해 주세요'); end if;
    if y < this_year - 5 or y > this_year then return jsonb_build_object('ok', false, 'error', '기부 연도를 확인해 주세요'); end if;
    if length(coalesce(p->>'note', '')) > 500 or length(coalesce(p->>'address', '')) > 200 then
      return jsonb_build_object('ok', false, 'error', '입력이 너무 길어요');
    end if;

    -- 교인 연결: 성명+휴대폰이 한 명과만 맞을 때
    select min(id) into mid from member
    where active and name || coalesce(name_suffix, '') = nm and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = ph
    having count(*) = 1;

    if ret then
      -- 지난 신청 → 없으면 교인정보. 찾은 값은 돌려주지 않는다.
      select rrn_enc, address, member_id into prev_rrn, prev_addr, prev_member from donation_request
      where name = nm and regexp_replace(coalesce(phone, ''), '\D', '', 'g') = ph and rrn_enc is not null
      order by created_at desc limit 1;
      if prev_rrn is null and mid is not null then
        select rrn_enc, address into prev_rrn, prev_addr from member where id = mid;
      end if;
      if prev_rrn is null then
        return jsonb_build_object('ok', false, 'error', '일치하는 지난 신청이 없어요. 처음 신청으로 입력해 주세요');
      end if;
    else
      if rrn !~ '^\d{6}[1-8]\d{6}$' then return jsonb_build_object('ok', false, 'error', '주민등록번호 13자리를 확인해 주세요'); end if;
      if coalesce(trim(p->>'address'), '') = '' then return jsonb_build_object('ok', false, 'error', '도로명주소를 넣어 주세요'); end if;
      prev_rrn := private.enc_public(substr(rrn, 1, 6) || '-' || substr(rrn, 7));
    end if;

    if jsonb_typeof(p->'family_names') = 'array' then
      select array_agg(v) into fam from (
        select left(trim(x), 30) v from jsonb_array_elements_text(p->'family_names') x where trim(x) <> '' limit 10) s;
    end if;

    insert into donation_request (year, name, rrn_enc, address, phone, family_names, member_id, verified_by,
                                  consent_at, fp_hash, request_note, is_returning)
    values (y, nm, prev_rrn,
            coalesce(nullif(left(trim(coalesce(p->>'address', '')), 200), ''), prev_addr),
            substr(ph, 1, 3) || '-' || substr(ph, 4, length(ph) - 7) || '-' || right(ph, 4),
            fam, coalesce(mid, prev_member), case when ret then 'name_phone' end,
            now(), nullif(fp, ''), nullif(left(trim(coalesce(p->>'note', '')), 500), ''), ret)
    returning id into nid;
  exception when others then
    return jsonb_build_object('ok', false, 'error', '입력을 확인해 주세요');
  end;

  return jsonb_build_object('ok', true, 'request_no',
    'D' || to_char(now() at time zone 'Asia/Seoul', 'YYMMDD') || '-' || lpad(nid::text, 4, '0'));
end $$;
revoke execute on function public.submit_donation_request(jsonb) from public;
grant execute on function public.submit_donation_request(jsonb) to anon, authenticated;

-- ===== 6. 사용내역: 영수증·신청 변경 기록 =====
create trigger donation_receipt_audit after insert or update or delete on donation_receipt
  for each row execute function public.write_audit();
create trigger donation_request_audit after update or delete on donation_request
  for each row execute function public.write_audit();
