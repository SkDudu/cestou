const styles: Record<string, string> = {
  validated: "bg-emerald-950 text-emerald-300 border-emerald-800",
  pending: "bg-zinc-800 text-zinc-300 border-zinc-700",
  suspicious: "bg-amber-950 text-amber-300 border-amber-800",
  invalid: "bg-rose-950 text-rose-300 border-rose-800",
  completed: "bg-emerald-950 text-emerald-300 border-emerald-800",
  running: "bg-sky-950 text-sky-300 border-sky-800",
  failed: "bg-rose-950 text-rose-300 border-rose-800",
  open: "bg-amber-950 text-amber-300 border-amber-800",
  resolved: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

const labels: Record<string, string> = {
  validated: "Validated",
  pending: "Pending",
  suspicious: "Suspicious",
  invalid: "Invalid",
  completed: "Completed",
  running: "Running",
  failed: "Failed",
  open: "Open",
  resolved: "Resolved",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded border px-2 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
