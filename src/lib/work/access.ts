// 외부 노출 화면(부서장 모바일 /m, 지출신청 /request) 접근 규칙. src/proxy.ts 와 화면이 같이 쓴다.
export type Area = "m" | "request";
export type Me = { status: string; role: string } | null | undefined;

/** 로그인 없이 여는 안내 화면 */
export const M_LOGIN = "/m/login";

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

/** 주소가 속한 외부 화면 영역 (/m/login 은 제외) */
export function areaOf(path: string): Area | null {
  if (under(path, M_LOGIN)) return null;
  if (under(path, "/m")) return "m";
  if (under(path, "/request")) return "request";
  return null;
}

export const AREA_ROLES: Record<Area, readonly string[]> = {
  m: ["dept_head", "admin"],
  request: ["dept_head", "pastor", "admin"],
};

export const canEnter = (area: Area, me: Me) => !!me && me.status === "approved" && AREA_ROLES[area].includes(me.role);

/** 영수증 사진 올리기(/api/receipts POST): 재정부원 + 신청자 */
export const RECEIPT_UPLOAD_ROLES = ["admin", "treasurer", "dept_head", "pastor"] as const;
export const canUploadReceipt = (me: Me) => !!me && me.status === "approved" && (RECEIPT_UPLOAD_ROLES as readonly string[]).includes(me.role);

/** 재정 화면 권한이 없을 때 보낼 곳: 부서장 → /m, 목회자 → /request, 그 외 → /pending */
export function homeFor(me: Me) {
  if (me?.status === "approved" && me.role === "dept_head") return "/m";
  if (me?.status === "approved" && me.role === "pastor") return "/request";
  return "/pending";
}
