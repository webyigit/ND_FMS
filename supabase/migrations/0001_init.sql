create extension if not exists pgcrypto;
-- NDFMS2 DB 스키마 초안 v1 (2026-10-07) / PostgreSQL(Supabase)
-- 근거: 요구사항정의 + 원본구조분석_261007_v1.md

-- ===== 0. 회원·권한 =====
create type user_status as enum ('pending','approved','blocked');
create type user_role as enum ('admin','treasurer','viewer');
create table app_user (
  id uuid primary key,                       -- auth.users.id
  name text not null,
  phone text,                                -- SMS 인증 번호
  status user_status not null default 'pending',  -- 관리자 승인 전 접근 불가
  role user_role not null default 'viewer',
  approved_by uuid references app_user(id),
  approved_at timestamptz,
  created_at timestamptz default now()
);
create table social_identity (               -- 카카오/네이버 등
  user_id uuid references app_user(id) on delete cascade,
  provider text not null, provider_uid text not null,
  primary key (provider, provider_uid)
);

-- ===== 1. 교인·가족 =====
create table household (id bigserial primary key, label text);  -- 가족 단위
create table member (
  id bigserial primary key,
  name text not null,
  name_suffix text,                          -- 동명이인 구분(A/B)
  household_id bigint references household(id),
  is_household_head boolean default false,   -- 기부금영수증 발행 당사자
  title text,                                -- 직분(원로목사, 시무장로...)
  display_rank int,                          -- 헌금명단 노출순서(null=가나다)
  district text, zone text,                  -- 교구/구역
  service_dept text, service_role text,      -- 봉사부서/직책
  phone text, address text,
  rrn_enc bytea,                             -- 주민번호 암호화 저장(pgcrypto), 평문 금지
  is_group boolean default false,            -- 단체(여전도회 등)
  is_anonymous boolean default false,        -- 무명
  active boolean default true,
  created_at timestamptz default now()
);
create index on member (name);
create table member_alias (                  -- 은행 적요 매칭용(이름 줄임, 가족묶음 표기)
  id bigserial primary key,
  member_id bigint references member(id) on delete cascade,
  alias text not null
);
create table officer_roster (                -- 연도별 재직명단
  year int not null, member_id bigint references member(id), position text,
  primary key (year, member_id)
);

-- ===== 2. 기금·헌금구분·부서/항목·예산 =====
create type fund_kind as enum ('general','special','separate'); -- 일반/특별/별도(해외선교·네팔)
create table fund (id serial primary key, code text unique, name text, kind fund_kind not null);
create table offering_type (
  id serial primary key,
  fund_id int references fund(id),
  parent_id int references offering_type(id),   -- 감사헌금 > 범사/기타/일천번제
  name text not null,
  total_only boolean default false,             -- 주일헌금: 총액만 입력
  amount_unit int default 1,                    -- 입력 단위(1000/10000)
  has_memo boolean default false,               -- 기타감사 등 내용칸
  sort_order int, active boolean default true
);
create table department (id serial primary key, name text, head_member_id bigint references member(id), sort_order int);
create table expense_item (id serial primary key, department_id int references department(id), name text, fund_id int references fund(id), sort_order int);
create table budget (
  year int not null,
  offering_type_id int references offering_type(id),
  expense_item_id int references expense_item(id),
  amount bigint not null default 0,
  check ((offering_type_id is null) <> (expense_item_id is null))
);
create table carryover (year int, fund_id int references fund(id), amount bigint, primary key(year,fund_id));

-- ===== 3. 주차 =====
create table week (
  id serial primary key,
  sunday date unique not null,              -- 주일 기준 주 1회 장표
  year int generated always as (extract(year from sunday)::int) stored,
  week_no int, closed boolean default false
);

-- ===== 4. 수입 =====
create type pay_channel as enum ('cash','online');
create table income (
  id bigserial primary key,
  week_id int references week(id) not null,
  offering_type_id int references offering_type(id) not null,
  member_id bigint references member(id),   -- null = 총액 입력(주일헌금 등)
  payer_label text,                          -- 원문 표기(가족묶음 등)
  channel pay_channel not null default 'cash',
  amount bigint not null,
  memo text,
  bank_tx_id bigint,                         -- 은행거래에서 인입된 경우
  created_by uuid references app_user(id), created_at timestamptz default now(),
  updated_at timestamptz
);
create index on income (member_id); create index on income (week_id);

-- ===== 5. 은행 =====
create table bank_account (                  -- 재정부 계좌
  id serial primary key, bank text, account_no_enc bytea, holder text,
  kind text,                                 -- 일반/대출/외화/적금
  is_primary boolean default false
);
create table payee (                         -- 개인·업체 송금 계좌
  id bigserial primary key, member_id bigint references member(id),
  name text, bank text, account_no_enc bytea, holder text, memo text
);
create table bank_import (id bigserial primary key, bank_account_id int references bank_account(id), file_name text, period_from date, period_to date, imported_by uuid, imported_at timestamptz default now());
create table bank_tx (
  id bigserial primary key,
  import_id bigint references bank_import(id),
  bank_account_id int references bank_account(id),
  tx_at timestamptz not null,
  withdraw bigint default 0, deposit bigint default 0, balance bigint,
  tx_type text,                              -- 거래내용(인터넷당행, 현금...)
  description text,                          -- 거래기록사항(이름+헌금종류)
  branch text, transfer_memo text, tx_memo text,
  suggested_offering_type_id int references offering_type(id), -- 자동분류
  suggested_member_id bigint references member(id),
  suggested_expense_item_id int,
  linked boolean default false,
  unique (bank_account_id, tx_at, withdraw, deposit, balance) -- 중복 업로드 방지
);

-- ===== 6. 지출 =====
create table expense (
  id bigserial primary key,
  week_id int references week(id) not null,
  expense_item_id int references expense_item(id) not null,
  budget_source_item_id int references expense_item(id), -- 예산 전용(예비비 등)
  content text not null,
  amount bigint not null,
  fee bigint default 0,                      -- 송금 수수료
  requester_member_id bigint references member(id),
  payee_id bigint references payee(id),
  method text,                               -- 송금/자동출금/현금
  split_group uuid,                          -- 분할지출 묶음(1/3,2/3...)
  receipt_file_id bigint,
  bank_tx_id bigint references bank_tx(id),
  memo text,
  created_by uuid, created_at timestamptz default now(), updated_at timestamptz
);
create table fixed_expense (                 -- 고정지출
  id serial primary key, week_of_month int check (week_of_month between 1 and 5),
  content text, amount bigint, expense_item_id int references expense_item(id),
  payee_id bigint references payee(id), memo text, active boolean default true
);
create table receipt_file (                  -- 영수증 PDF/이미지 + 인식결과
  id bigserial primary key, storage_path text, file_name text,
  extracted jsonb,                           -- [{no, content, dept, requester, amount, vendor, date}]
  uploaded_by uuid, uploaded_at timestamptz default now()
);

-- ===== 7. 회계 간 대체·차입 =====
create table fund_transfer (id bigserial primary key, week_id int references week(id), from_fund int references fund(id), to_fund int references fund(id), amount bigint, memo text);
create table loan (id serial primary key, lender text, principal bigint, memo text);

-- ===== 8. 검증시트 =====
create table reconciliation (
  week_id int primary key references week(id),
  bank_balance bigint,          -- A
  pending_deposit bigint,       -- B
  mission_unremitted bigint,    -- D
  base_surplus bigint,          -- H (전년 이월 기준잉여금)
  note text
);  -- C,E,F,G,차이는 뷰에서 계산

-- ===== 9. 기부금영수증 =====
create table church_info (id int primary key default 1, name text, pastor text, address text, reg_no text, seal_path text, stamp_path text);
create table receipt_form (id serial primary key, name text, version text, template_path text, active boolean);
create table donation_receipt (
  id bigserial primary key,
  year int not null,
  serial_no text unique not null,            -- {연도}-{PN|CP}{일련3}-{MMDD}
  donor_kind text check (donor_kind in ('PN','CP')),
  member_id bigint references member(id),    -- 발행 당사자(가족 합산)
  donor_name text, donor_rrn_enc bytea, donor_address text,
  total_amount bigint not null,
  detail jsonb,                              -- 헌금구분별 금액
  form_id int references receipt_form(id),
  issued_at date, issued_by uuid,
  canceled boolean default false
);

-- ===== 10. 사용이력 =====
create table audit_log (
  id bigserial primary key, user_id uuid, action text, -- view/menu/insert/update/delete
  target_table text, target_id text, before jsonb, after jsonb,
  at timestamptz default now()
);

-- 개인정보: rrn/계좌는 pgcrypto 암호화, RLS로 role별 접근 제한. 실데이터는 저장소에 커밋하지 않음.
