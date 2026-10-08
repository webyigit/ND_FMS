"use client";
import { useEffect } from "react";

// 설치형 앱(PWA): 서비스워커를 등록해 화면 껍데기·정적 파일을 기기에 두고, 오프라인에서도 화면이 열리게 한다.
// 개발 모드에서는 캐시가 수정 사항을 가려서 등록하지 않는다.
const WARM = ["/dashboard", "/income/entry", "/expense/entry", "/income/weekly", "/expense/report", "/expense/verify", "/todo"];

export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((reg) => {
      // 자주 쓰는 화면은 들어가 보지 않아도 미리 받아 둔다 (로그인 쿠키가 있을 때만 의미 있음)
      const warm = () => reg.active?.postMessage({ type: "warm", urls: WARM });
      if (reg.active) warm(); else navigator.serviceWorker.addEventListener("controllerchange", warm, { once: true });
    }).catch(() => {});
  }, []);
  return null;
}
