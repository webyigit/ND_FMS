-- 기부금영수증 보완 (2026-10-07)
-- 근거: 2025년도 개인별 헌금 총합계·영수증 발행금액 시트, 종이 기부금영수증 신청서

-- 1) 발행금액은 실헌금 합계와 다를 수 있고, 부부 간 비율로 나눠 발행한다
alter table donation_receipt
  add column donation_year int,                 -- 기부 연도(예: 2025년분을 2026년에 발행)
  add column issued_amount bigint,              -- 영수증에 적는 발행금액
  add column adjustment_amount bigint default 0,-- 조정액(가산 등)
  add column adjustment_reason text,
  add column split_group uuid,                  -- 함께 나눈 영수증 묶음
  add column split_ratio numeric(5,2),          -- 예: 60.00 / 40.00
  add column status text not null default 'issued'
    check (status in ('issued','not_issued','canceled','reissued')), -- 발행안함 포함
  add column reissue_of_id bigint references donation_receipt(id),
  add column donor_brn text,                    -- 법인 사업자번호(CP)
  add column donor_rep_name text,               -- 법인 대표자명(CP)
  add column memo text,
  add column source_sheet text, add column source_row int; -- 이관 원본 추적
comment on column donation_receipt.total_amount is '실헌금 합계(가족 합산)';

-- 2) 영수증 1건 ↔ 헌금 표기 여러 건(공동명의·가족 묶음)
create table donation_receipt_source (
  receipt_id bigint references donation_receipt(id) on delete cascade,
  payer_label text not null,                    -- income.payer_label 원문(예: 홍길동,김영희)
  amount bigint not null,                       -- 이 표기에서 합산된 금액
  primary key (receipt_id, payer_label)
);

-- 3) 표기 정규화: 오타·구분자(. , /)·동명이인 접미사·법인 표기 차이를 교인에 연결
alter table member_alias add column kind text default 'name'
  check (kind in ('name','typo','joint','corporate'));
alter table member add column exclude_from_receipt boolean default false; -- 무명 등

-- 4) 종이 신청서 항목 반영: 휴대폰·도로명주소·요청사항, 재신청은 성명+연락처만
alter table donation_request
  add column request_note text,                 -- 요청주실 말씀
  add column is_returning boolean default false,-- 이전 신청자(성명+연락처로 확인)
  add column pickup text default 'envelope';    -- 수령: 헌금봉투 찾는 곳
alter table donation_request alter column rrn_enc drop not null; -- 재신청자는 생략 가능
