// Supabase 연결값: 배포 환경 변수에만 둔다(.env.example 참고). 없으면 데모 모드로 동작한다.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isDbConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** 로그인 없이 열리는 주소: 로그인·가입, 성도 공지, 공개 신청, 부서장 모바일(다음 단계에서 보호) */
export const PUBLIC_PATHS = ["/login", "/auth", "/pending", "/notice", "/donation-request", "/request", "/m"];
export const isPublicPath = (path: string) => PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

/** 재정 화면을 쓸 수 있는 권한 */
export const FINANCE_ROLES = ["admin", "treasurer"] as const;

/** 로그인 후 돌아갈 주소: 같은 사이트 안의 경로만 허용(외부 주소로 튕기기 방지) */
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}
