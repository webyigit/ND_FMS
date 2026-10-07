"use client";
import Link from "next/link";
import { useState } from "react";
import MobileShell, { DemoOnly } from "./MobileShell";
import ExpenseRequestForm from "./ExpenseRequestForm";
import MyRequests from "./MyRequests";
import { supabaseBrowser } from "@/lib/supabase/client";

// 부서장: 지출 신청 /m/expense/new
export function DeptExpenseNew() {
  return (
    <MobileShell title="지출 신청" nav="dept" account>
      {supabaseBrowser() ? <ExpenseRequestForm listHref="/m/expense" /> : <DemoOnly what="지출 신청" />}
    </MobileShell>
  );
}

// 부서장: 내 신청 내역 /m/expense
export function DeptExpenseList() {
  return (
    <MobileShell title="내 신청 내역" nav="dept" account>
      {supabaseBrowser() ? (
        <>
          <Link href="/m/expense/new" className="mb-3 block rounded bg-primary py-3 text-center text-sm font-medium text-white">지출 신청하기</Link>
          <MyRequests editHref="/m/expense/new" />
        </>
      ) : <DemoOnly what="신청 내역" />}
    </MobileShell>
  );
}

// 지출신청하기 /request (부서장·목회자): 신청과 내 신청 목록을 한 화면에
export function RequestPage() {
  const [tick, setTick] = useState(0);
  return (
    <MobileShell title="지출신청" account>
      {supabaseBrowser() ? (
        <>
          <ExpenseRequestForm listHref="#mine" onSaved={() => setTick((t) => t + 1)} />
          <div id="mine" className="mb-2 mt-6 text-sm font-semibold text-heading">내 신청</div>
          <MyRequests editHref="/request" reloadKey={tick} />
        </>
      ) : <DemoOnly what="지출 신청" />}
    </MobileShell>
  );
}
