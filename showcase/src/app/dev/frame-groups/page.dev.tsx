import { notFound } from "next/navigation";
import FrameGroupsViewer from "./FrameGroupsViewer";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Frame Groups (dev)",
  robots: { index: false, follow: false },
};

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <FrameGroupsViewer />;
}
