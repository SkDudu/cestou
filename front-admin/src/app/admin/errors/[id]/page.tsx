import { redirect } from "next/navigation";

export default async function ErrorDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/extraction/errors/${id}`);
}
