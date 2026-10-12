// 자동완성 목록 키보드 선택: ↑↓로 움직이고 Enter로 고른다, Esc로 선택 해제. 검색어(resetKey)가 바뀌면 처음부터.
import { useState, type KeyboardEvent } from "react";

/** 다음 위치(-1 = 아무것도 안 고름). 끝에서 처음으로, 처음에서 끝으로 돈다 */
export function nextIndex(active: number, len: number, key: string): number {
  if (len <= 0) return -1;
  if (key === "ArrowDown") return active < 0 || active >= len - 1 ? 0 : active + 1;
  if (key === "ArrowUp") return active <= 0 ? len - 1 : active - 1;
  return active;
}

/**
 * 사용: const nav = useListNav(items, pick, query); <input onKeyDown={nav.onKeyDown}/> 목록 항목에 nav.itemProps(i).
 * onKeyDown 은 처리했으면 true. Enter 는 ↑↓로 고른 항목이 있을 때만 처리하므로, 입력창의 원래 Enter 동작은 false 일 때 이어서 하면 된다.
 */
export function useListNav<T>(items: T[], onPick: (item: T) => void, resetKey: unknown) {
  const [state, setState] = useState<{ key: unknown; active: number }>({ key: resetKey, active: -1 });
  const active = state.key === resetKey && state.active < items.length ? state.active : -1;
  const set = (i: number) => setState({ key: resetKey, active: i });
  const onKeyDown = (e: KeyboardEvent): boolean => {
    if (e.nativeEvent.isComposing || !items.length) return false;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); set(nextIndex(active, items.length, e.key)); return true; }
    if (e.key === "Enter" && active >= 0) { e.preventDefault(); onPick(items[active]); set(-1); return true; }
    if (e.key === "Escape" && active >= 0) { set(-1); return true; }
    return false;
  };
  const itemProps = (i: number) => ({
    "aria-selected": i === active,
    onMouseEnter: () => set(i),
    ref: i === active ? (el: HTMLElement | null) => { el?.scrollIntoView({ block: "nearest" }); } : undefined,
    className: i === active ? "bg-surface-2" : "",
  });
  return { active, onKeyDown, itemProps };
}
