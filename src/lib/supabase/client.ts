"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isDbConfigured } from "./config";

let client: SupabaseClient | null = null;

/** 브라우저용 클라이언트. 데모 모드(연결값 없음)면 null */
export function supabaseBrowser(): SupabaseClient | null {
  if (!isDbConfigured) return null;
  client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
