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
        <h1 className="text-xl font-semibold text-zinc-100">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-zinc-500">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
