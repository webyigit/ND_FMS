import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_KEY, SUPABASE_URL, isDbConfigured, safeNext } from "@/lib/supabase/config";

// 메일 확인·비밀번호 재설정·소셜 로그인에서 돌아오는 주소: 받은 코드로 세션을 만든다
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  if (!isDbConfigured || !code) return NextResponse.redirect(new URL("/login?error=1", url));

  const response = NextResponse.redirect(new URL(next, url));
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? NextResponse.redirect(new URL("/login?error=1", url)) : response;
}
