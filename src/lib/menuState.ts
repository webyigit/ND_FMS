"use client";
// 사이드바 메뉴 펼침/닫기 상태(브라우저에 저장). 기본은 모두 펼침. 서버 렌더 때는 빈 값(모두 펼침)으로 그린다.
import { useCallback, useSyncExternalStore } from "react";
import { MENU } from "./menu";

const KEY = "ndfms.menu.open";
const EVENT = "ndfms:menu";
export const STEPS_KEY = "매주 업무 순서";
type OpenMap = Record<string, boolean>;
const ALL = [STEPS_KEY, ...MENU.map((g) => g.label)];

const read = () => { try { return localStorage.getItem(KEY) ?? "{}"; } catch { return "{}"; } };
const subscribe = (cb: () => void) => { window.addEventListener(EVENT, cb); window.addEventListener("storage", cb); return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); }; };
const write = (next: OpenMap) => { try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} window.dispatchEvent(new Event(EVENT)); };

export function useMenuOpen() {
  const raw = useSyncExternalStore(subscribe, read, () => "{}");
  const open: OpenMap = (() => { try { return JSON.parse(raw); } catch { return {}; } })();
  const isOpen = useCallback((label: string) => open[label] !== false, [open]);
  const toggle = useCallback((label: string) => write({ ...open, [label]: !isOpen(label) }), [open, isOpen]);
  const allOpen = ALL.every(isOpen);
  const setAll = useCallback((v: boolean) => write(Object.fromEntries(ALL.map((l) => [l, v]))), []);
  /** 현재 화면이 속한 묶음은 닫혀 있어도 보이게 */
  const openFor = useCallback((label: string) => write({ ...open, [label]: true }), [open]);
  return { isOpen, toggle, allOpen, setAll, openFor };
}
