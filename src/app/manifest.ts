import type { MetadataRoute } from "next";

// 설치형 앱(PWA) 정보: 브라우저 '홈 화면에 추가'·'앱 설치'에 쓰인다
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "재정관리시스템",
    short_name: "재정관리",
    description: "ND_FMS 재정관리시스템",
    start_url: "/dashboard",
    display: "standalone",
    lang: "ko",
    background_color: "#f6f8fb",
    theme_color: "#22c55e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
