import { notFound } from "next/navigation";
import { manifest, findPack } from "@/lib/manifest";
import { PackViewer } from "@/components/PackViewer";

export function generateStaticParams() {
  return manifest.packs.map((p) => ({ vendor: p.vendor, pack: p.pack }));
}

export default async function PackPage({
  params,
  searchParams,
}: {
  params: Promise<{ vendor: string; pack: string }>;
  searchParams?: Promise<{ model?: string | string[] }>;
}) {
  const { vendor, pack } = await params;
  const query = await searchParams;
  const model = Array.isArray(query?.model) ? query?.model[0] : query?.model;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  return <PackViewer pack={data} initialModelFile={model} />;
}
