-- 매주 업무 순서에 '검증'(검증시트 잔액 맞추기) 단계 추가(2026-10-16). 지출입력 다음, 금주 수입/지출 내역 출력 전.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.week_step'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%step%income_report%'
  loop
    execute format('alter table public.week_step drop constraint %I', c);
  end loop;
end $$;
alter table public.week_step add constraint week_step_step_check
  check (step in ('income', 'income_report', 'bank', 'expense', 'verify', 'report', 'ledger'));
