export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[28px] font-bold leading-8 tracking-[-0.04em] text-[var(--ds-color-foreground)]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-[var(--ds-color-muted-foreground)]">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
