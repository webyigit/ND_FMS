"use client";
// 부서장 모바일·지출신청 화면: 브라우저 전용(로그인 세션·위치 정보를 쓴다)이라 서버 렌더링 없이 불러온다
import dynamic from "next/dynamic";

export const MobileHome = dynamic(() => import("./MobileHome"), { ssr: false });
export const DeptBudget = dynamic(() => import("./DeptBudget"), { ssr: false });
export const BudgetRequestForm = dynamic(() => import("./BudgetRequestForm"), { ssr: false });
export const MobileLogin = dynamic(() => import("./MobileLogin"), { ssr: false });
export const DeptExpenseNew = dynamic(() => import("./RequestScreens").then((m) => m.DeptExpenseNew), { ssr: false });
export const DeptExpenseList = dynamic(() => import("./RequestScreens").then((m) => m.DeptExpenseList), { ssr: false });
export const RequestPage = dynamic(() => import("./RequestScreens").then((m) => m.RequestPage), { ssr: false });
