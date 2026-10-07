import { Suspense } from "react";
import LoginForm from "./LoginForm";

export const metadata = { title: "로그인 · 재정관리시스템" };

export default function Page() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
