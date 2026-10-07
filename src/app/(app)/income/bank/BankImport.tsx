"use client";
import { supabaseBrowser } from "@/lib/supabase/client";
import BankDb from "./BankDb";
import BankDemo from "./BankDemo";

// DB 연결 시 업로드·자동분류·수입 반영, 아니면 브라우저에서만 읽는 데모
export default function BankImport() {
  return supabaseBrowser() ? <BankDb /> : <BankDemo />;
}
