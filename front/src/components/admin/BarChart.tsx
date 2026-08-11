export function BarChart({
  items,
}: {
  items: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-xs text-zinc-400">
            <span>{item.label}</span>
            <span>{item.value}</span>
          </div>
          <div className="h-2 rounded bg-zinc-800">
            <div
              className="h-2 rounded bg-sky-500"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
