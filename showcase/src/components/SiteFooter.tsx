import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <p>GameDev Asset Library</p>
      <nav aria-label="Footer navigation">
        <Link href="/takedown-response">Takedown policy</Link>
        <Link href="/build-with-ai">Build with AI</Link>
      </nav>
    </footer>
  );
}
