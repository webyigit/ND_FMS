import PageHeader from "./PageHeader";

// 아직 구현 전인 화면: 요구사항 요약만 보여준다
export default function Todo({ spec }: { spec: string[] }) {
  return (
    <>
      <PageHeader />
      <div className="rounded-lg border border-dashed border-line bg-surface p-6 text-sm text-slate-600">
        <div className="mb-2 font-semibold">구현 예정</div>
        <ul className="list-disc space-y-1 pl-5">{spec.map((s) => <li key={s}>{s}</li>)}</ul>
      </div>
    </>
  );
}
