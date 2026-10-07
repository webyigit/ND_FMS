// 안내 띠: ok(초록) / error(빨강) / warn(주황)
export default function Notice({ kind = "ok", children }: { kind?: "ok" | "error" | "warn"; children: React.ReactNode }) {
  const c = { ok: "bg-success-subtle text-success", error: "bg-danger-subtle text-danger", warn: "bg-warning-subtle text-warning" }[kind];
  return <div className={`mb-3 rounded px-3 py-2 text-sm ${c}`}>{children}</div>;
}
