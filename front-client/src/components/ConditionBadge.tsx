export function ConditionBadge({
  condition,
  showAll = false,
}: {
  condition?: { kind: string; text: string } | null;
  showAll?: boolean;
}) {
  if (!condition) return null;
  if (condition.kind === "none") {
    if (!showAll) return null;
    return (
      <p className="mt-0.5 text-[11px] text-[var(--ds-color-muted-foreground)]">
        ✓ {condition.text}
      </p>
    );
  }
  if (condition.kind === "unknown") {
    return (
      <p className="mt-0.5 text-[11px] text-[var(--ds-color-danger)]">
        ⚠ {condition.text}
      </p>
    );
  }
  return (
    <p className="mt-0.5 text-[11px] text-[var(--ds-color-accent)]">
      {condition.text}
    </p>
  );
}
