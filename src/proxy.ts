import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { FINANCE_ROLES, SUPABASE_KEY, SUPABASE_URL, isDbConfigured, isPublicPath } from "@/lib/supabase/config";
import { M_LOGIN, areaOf, canEnter, canUploadReceipt, homeFor } from "@/lib/work/access";

// 로그인 세션을 갱신하고, 재정 화면은 승인된 재정부원만 들어오게 한다.
// 부서장 모바일(/m)·지출신청(/request)은 로그인 필수, 권한이 없으면 /m/login 안내로.
export async function proxy(request: NextRequest) {
  if (!isDbConfigured) return NextResponse.next(); // 데모 모드

  let response = NextResponse.next({ request });
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const path = request.nextUrl.pathname;
  if (isPublicPath(path)) return response;

  const isApi = path.startsWith("/api/");
  const here = path + request.nextUrl.search;
  const deny = (to: string, status: number, keepNext = status === 401) => {
    if (isApi) return NextResponse.json({ error: status === 401 ? "로그인이 필요합니다" : "권한이 없습니다" }, { status });
    const url = request.nextUrl.clone();
    url.pathname = to;
    url.search = keepNext ? `?next=${encodeURIComponent(here)}` : "";
    const r = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => r.cookies.set(c)); // 갱신된 세션 쿠키 유지
    return r;
  };
  if (!userId) return deny("/login", 401);

  const { data: me } = await supabase.from("app_user").select("status, role").eq("id", userId).maybeSingle();
  const area = areaOf(path);
  if (area) return canEnter(area, me) ? response : deny(M_LOGIN, 403, true);
  if (path === "/api/receipts" && request.method === "POST") return canUploadReceipt(me) ? response : deny("/pending", 403);

  const ok = me?.status === "approved" && (FINANCE_ROLES as readonly string[]).includes(me.role);
  return ok ? response : deny(homeFor(me), 403);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2?)$).*)"],
};
