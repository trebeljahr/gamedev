import Link from "next/link";
import { suggestPackIssueUrl } from "@/lib/github-issue";

export function SiteFooter() {
  const suggestPackUrl = suggestPackIssueUrl();
  return (
    <footer className="site-footer">
      <p>Free game assets, checked for permissive licenses and practical formats.</p>
      <nav aria-label="Footer navigation">
        <Link href="/support">Support the project</Link>
        <a href={suggestPackUrl} target="_blank" rel="noreferrer">
          Suggest a pack
        </a>
      </nav>
    </footer>
  );
}
