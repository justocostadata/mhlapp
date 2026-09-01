export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-[var(--mhl-border)] bg-[var(--mhl-panel)] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--mhl-muted)]">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}
