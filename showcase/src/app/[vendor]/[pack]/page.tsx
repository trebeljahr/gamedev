import { notFound } from "next/navigation";
import { manifest, findPack } from "@/lib/manifest";
import { PackViewer } from "@/components/PackViewer";

export function generateStaticParams() {
  return manifest.packs.map((p) => ({ vendor: p.vendor, pack: p.pack }));
}

export default async function PackPage({
  params,
}: {
  params: Promise<{ vendor: string; pack: string }>;
}) {
  const { vendor, pack } = await params;
  const data = findPack(vendor, pack);
  if (!data) notFound();
  return <PackViewer pack={data} />;
}
