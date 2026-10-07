-- 부가기능: 부서장 모바일, 지출신청, 기부금영수증 신청, 공지사항 (2026-10-07)
alter type user_role add value if not exists 'dept_head';
alter type user_role add value if not exists 'pastor';

create type request_status as enum ('requested','approved','rejected','done');

create table user_department (                 -- 부서장 ↔ 부서
  user_id uuid references app_user(id) on delete cascade,
  department_id int references department(id) on delete cascade,
  primary key (user_id, department_id)
);

create table notice (                          -- 공지사항
  id bigserial primary key,
  title text not null, body text not null,
  audience text not null default 'dept_head',  -- dept_head/all
  pinned boolean default false,
  published_at timestamptz,
  created_by uuid references app_user(id), created_at timestamptz default now()
);

create table budget_request (                  -- 예산 신청
  id bigserial primary key,
  year int not null,
  department_id int references department(id) not null,
  expense_item_id int references expense_item(id),
  amount bigint not null, reason text,
  status request_status not null default 'requested',
  requested_by uuid references app_user(id), requested_at timestamptz default now(),
  reviewed_by uuid references app_user(id), reviewed_at timestamptz, review_note text
);

create table expense_request (                 -- 지출 신청(부서장 모바일 + 지출신청하기 공용)
  id bigserial primary key,
  department_id int references department(id),  -- 목회자 신청은 null, 검토 시 지정
  expense_item_id int references expense_item(id),
  content text not null,
  amount bigint not null,
  used_at date,
  receipt_file_id bigint references receipt_file(id), -- 사진 + AI 인식 결과(extracted)
  payee_id bigint references payee(id),          -- 송금받을 계좌
  status request_status not null default 'requested',
  requested_by uuid references app_user(id), requested_at timestamptz default now(),
  reviewed_by uuid references app_user(id), reviewed_at timestamptz, review_note text,
  expense_id bigint references expense(id)       -- 승인 후 생성된 지출
);

create table donation_request (                -- 기부금영수증 신청(공개 페이지)
  id bigserial primary key,
  year int not null,
  name text not null,
  rrn_enc bytea not null,                        -- 서버에서 즉시 암호화
  address text,
  receipt_name text,                             -- 영수증 발행자명 [확인 필요]
  phone text,
  family_names text[],                           -- 가족명단(헌금 표기에서 불러와 수정)
  member_id bigint references member(id),        -- 매칭된 교인
  verified_by text,                              -- sms/birth_phone4
  consent_at timestamptz not null,               -- 개인정보 동의
  ip_hash text,                                  -- IP는 해시만
  status request_status not null default 'requested',
  donation_receipt_id bigint references donation_receipt(id),
  created_at timestamptz default now(),
  reviewed_by uuid references app_user(id), reviewed_at timestamptz, review_note text
);

create table request_rate_limit (              -- 공개 페이지 요청 제한
  key text primary key,                          -- ip_hash 또는 phone
  window_start timestamptz not null,
  count int not null default 0,
  blocked_until timestamptz
);

-- 공개 신청 테이블은 클라이언트 직접 접근 금지(RLS on, 정책 없음) → 서버 API(서비스 키)로만 쓰기
alter table donation_request enable row level security;
alter table request_rate_limit enable row level security;
