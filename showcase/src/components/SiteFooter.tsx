import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>GameDev Asset Library</p>
      <nav aria-label="Footer navigation">
        <Link href="/supporters">Support the project</Link>
        <Link href="/takedown-response">Takedown policy</Link>
        <Link href="/build-with-ai">Build with AI</Link>
        <Link href="/api/catalog.json">Catalog JSON</Link>
      </nav>
    </footer>
  );
}
