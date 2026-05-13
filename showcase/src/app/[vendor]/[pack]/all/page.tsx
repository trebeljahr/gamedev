import { notFound } from "next/navigation";
import { PackAllModelsWorld } from "@/components/PackAllModelsWorld";
import { findPack, manifest } from "@/lib/manifest";

export function generateStaticParams() {
  return manifest.packs.map((p) => ({ vendor: p.vendor, pack: p.pack }));
}

export default async function PackAllModelsPage({
  params,
}: {
  params: Promise<{ vendor: string; pack: string }>;
}) {
  const { vendor, pack } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();

  return <PackAllModelsWorld pack={data} />;
}
