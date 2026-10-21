import { notFound } from "next/navigation";
import { FormatCatalogPage, formatPageCount, formatPageMetadata } from "@/components/FormatCatalogPage";
import { isModelFormat, MODEL_FORMATS } from "@/lib/model-formats";

type Props = { params: Promise<{ format: string; page: string }> };

export function generateStaticParams() {
  return MODEL_FORMATS.flatMap((format) =>
    Array.from({ length: formatPageCount(format) - 1 }, (_, index) => ({ format, page: String(index + 2) })),
  );
}

async function checkedParams(props: Props) {
  const { format, page } = await props.params;
  if (!isModelFormat(format) || !/^[1-9]\d*$/.test(page)) notFound();
  const pageNumber = Number(page);
  if (pageNumber < 2 || pageNumber > formatPageCount(format)) notFound();
  return { format, pageNumber };
}

export async function generateMetadata(props: Props) {
  const { format, pageNumber } = await checkedParams(props);
  return formatPageMetadata(format, pageNumber);
}

export default async function Page(props: Props) {
  return <FormatCatalogPage {...await checkedParams(props)} />;
}
