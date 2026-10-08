// IndexedDB 얇은 래퍼 (의존성 없음). 저장소: kv(읽기 캐시), outbox(올릴 입력 대기열)
// 사생활 보호 모드 등으로 IndexedDB 를 못 쓰면 모두 조용히 실패하고, 화면은 온라인 전용처럼 동작한다.
const NAME = "ndfms-offline";
const VERSION = 1;
export type Store = "kv" | "outbox";

let dbp: Promise<IDBDatabase> | null = null;

export function idb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("이 브라우저는 로컬 저장(IndexedDB)을 지원하지 않아요"));
  dbp ??= new Promise((resolve, reject) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
      if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbp = null; }; resolve(r.result); };
    r.onerror = () => { dbp = null; reject(r.error); };
    r.onblocked = () => { dbp = null; reject(new Error("로컬 저장소가 다른 탭에서 쓰는 중이에요")); };
  });
  return dbp;
}

const wait = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function tx<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const d = await idb();
  return wait(fn(d.transaction(store, mode).objectStore(store)));
}

export const kvGet = <T,>(key: string) => tx<T | undefined>("kv", "readonly", (s) => s.get(key) as IDBRequest<T | undefined>);
export const kvSet = (key: string, value: unknown) => tx("kv", "readwrite", (s) => s.put(value, key));
export const kvDel = (key: string) => tx("kv", "readwrite", (s) => s.delete(key));
export const kvKeys = () => tx<IDBValidKey[]>("kv", "readonly", (s) => s.getAllKeys());

export const storeAll = <T,>(store: Store) => tx<T[]>(store, "readonly", (s) => s.getAll() as IDBRequest<T[]>);
export const storePut = <T,>(store: Store, value: T) => tx<IDBValidKey>(store, "readwrite", (s) => s.put(value));
export const storeDel = (store: Store, key: IDBValidKey) => tx(store, "readwrite", (s) => s.delete(key));

/** 기기에 남은 로컬 데이터를 모두 지운다 (로그아웃 때 선택) */
export async function deleteDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try { (await dbp)?.close(); } catch {}
  dbp = null;
  await new Promise<void>((res) => {
    const r = indexedDB.deleteDatabase(NAME);
    r.onsuccess = r.onerror = r.onblocked = () => res();
  });
}
