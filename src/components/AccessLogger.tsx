"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

// 화면 접속 기록: 경로가 바뀔 때마다 사용내역에 남긴다(데모 모드면 아무것도 안 함)
let last = "";
export default function AccessLogger() {
  const path = usePathname();
  useEffect(() => {
    const sb = supabaseBrowser();
    if (!sb || !path || path === last) return;
    last = path;
    sb.rpc("log_event", { p_action: "view", p_target: path }).then(() => {}, () => {});
  }, [path]);
  return null;
}
