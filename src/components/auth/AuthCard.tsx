import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faWonSign } from "@fortawesome/free-solid-svg-icons";

// 로그인·가입·승인대기 화면 공통 틀
export default function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-lg bg-surface p-6 shadow-card">
        <div className="mb-6 flex items-center gap-2 text-lg font-bold text-heading">
          <span className="flex h-8 w-8 items-center justify-center rounded-base bg-primary text-sm text-white"><FontAwesomeIcon icon={faWonSign} /></span>
          재정관리시스템
        </div>
        <h1 className="mb-4 text-[18px] font-semibold text-heading">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export const authInput = "mt-1 w-full rounded border px-3 py-2 text-sm text-heading";
export const authButton = "w-full rounded bg-primary py-2 text-sm font-medium text-white disabled:opacity-60";
