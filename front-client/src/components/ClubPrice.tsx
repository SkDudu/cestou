import { Money } from "@/components/ui";

export function ClubPrice({
  publicPrice,
  memberPrice,
  membershipName,
}: {
  publicPrice: number;
  memberPrice?: number | null;
  membershipName?: string | null;
}) {
  return (
    <div className="text-right">
      <Money value={publicPrice} className="text-[var(--moss)]" />
      {memberPrice != null && memberPrice !== publicPrice ? (
        <p className="mt-0.5 text-[11px] text-[var(--amber)]">
          Clube{membershipName ? ` ${membershipName}` : ""}:{" "}
          <Money value={memberPrice} />
        </p>
      ) : null}
    </div>
  );
}
