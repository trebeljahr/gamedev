import { notFound } from "next/navigation";
import { FormatCatalogPage, formatPageMetadata } from "@/components/FormatCatalogPage";
import { isModelFormat, MODEL_FORMATS } from "@/lib/model-formats";

export function generateStaticParams() {
  return MODEL_FORMATS.map((format) => ({ format }));
}

export async function generateMetadata({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!isModelFormat(format)) notFound();
  return formatPageMetadata(format);
}

export default async function Page({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!isModelFormat(format)) notFound();
  return <FormatCatalogPage format={format} />;
}
