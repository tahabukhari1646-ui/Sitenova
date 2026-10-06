import { WebsiteDetailView } from "@/features/websites/components/WebsiteDetailView";

export default async function WebsiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <WebsiteDetailView key={id} id={id} />;
}
