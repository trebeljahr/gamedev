import Link from "next/link";
import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { SiteHeader } from "@/components/SiteHeader";
import { pageMetadata } from "@/lib/seo";

const DEMO_REPO_URL = "https://github.com/trebeljahr/gamedev-asset-library-demo";
const CATALOG_PATH = "/api/catalog.json";
const CATALOG_URL = "https://gamedev.trebeljahr.com/api/catalog.json";
// Rico replaces this after recording the walkthrough.
const VIDEO_URL_PLACEHOLDER = "https://www.youtube.com/embed/REPLACE_WITH_WALKTHROUGH_VIDEO_ID";

const promptTemplate = `You are building a small browser game prototype with the GameDev Asset Library.

Catalog endpoint: ${CATALOG_URL}
Site-relative catalog path: ${CATALOG_PATH}
Demo repo reference: ${DEMO_REPO_URL}

Use the catalog as the source of truth. Search it before inventing assets.

Goal:
- Build one playable scene that uses at least one 3D model, one sprite or texture, one sound effect, and one music loop from the catalog.
- Keep every asset's license, creator, source URL, and download URL in THIRD_PARTY.md.
- Prefer GLB for Three.js / React Three Fiber. Prefer OGG or MP3 for browser audio.
- Do not hotlink random assets from elsewhere.

Workflow:
1. Fetch ${CATALOG_PATH} or ${CATALOG_URL}.
2. Pick assets that fit the game idea and license constraints.
3. Download or reference only the catalog download URLs.
4. Add a short asset manifest in the repo with id, name, type, license, creator, sourceUrl, and local path.
5. Build the scene, wire basic controls, add audio, and leave clear run instructions.
6. Before finishing, verify the game boots locally and the attribution file matches the assets used.

If the MCP server is configured, use its search_assets, get_asset, and download_url tools instead of manually parsing the catalog.`;

const mcpConfig = `{
  "mcpServers": {
    "gamedev-assets": {
      "command": "npx",
      "args": ["-y", "@trebeljahr/gamedev-asset-mcp"],
      "env": {
        "GAMEDEV_ASSET_CATALOG_URL": "${CATALOG_URL}"
      }
    }
  }
}`;

const fetchExample = `const response = await fetch("${CATALOG_PATH}?page=1&per_page=100");
const catalog = await response.json();

for (const asset of catalog.items) {
  console.log(asset.id, asset.type, asset.license, asset.downloads);
}`;

export const metadata: Metadata = pageMetadata({
  title: "Build Games with AI Coding Agents",
  description:
    "Copy a prompt, configure the GameDev Asset Library MCP server, and point Claude Code, Cursor, or Codex at the public game-asset catalog.",
  pathname: "/build-with-ai",
});

type CodeBlockProps = {
  children: string;
  label?: string;
};

const shellStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "linear-gradient(180deg, rgba(116,201,255,0.08), rgba(116,201,255,0) 240px), var(--bg)",
};

const panelStyle: CSSProperties = {
  minWidth: 0,
  padding: 18,
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "rgba(17,18,22,0.88)",
  boxShadow: "0 22px 60px rgba(0,0,0,0.28)",
};

const codeStyle: CSSProperties = {
  display: "block",
  minWidth: 0,
  maxWidth: "100%",
  margin: 0,
  padding: 16,
  overflowX: "auto",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 8,
  background: "#08090d",
  color: "rgba(232,230,227,0.9)",
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: "0.82rem",
  lineHeight: 1.6,
  whiteSpace: "pre",
};

const inlineCodeStyle: CSSProperties = {
  padding: "2px 6px",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  background: "rgba(0,0,0,0.28)",
  color: "#ffe57d",
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  fontSize: "0.92em",
};

const eyebrowStyle: CSSProperties = {
  color: "var(--accent)",
  fontSize: 12,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "0.12em",
};

const proseStyle: CSSProperties = {
  margin: 0,
  color: "rgba(232,230,227,0.74)",
  fontSize: 15,
  lineHeight: 1.58,
};

const stackStyle: CSSProperties = {
  display: "grid",
  gap: 14,
};

const splitStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

function CodeBlock({ children, label }: CodeBlockProps) {
  return (
    <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
      {label && <span style={eyebrowStyle}>{label}</span>}
      <pre style={codeStyle}>
        <code>{children.trim()}</code>
      </pre>
    </div>
  );
}

function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export default function BuildWithAiPage() {
  return (
    <main style={shellStyle}>
      <AnalyticsBeacon event="build_with_ai_view" />
      <AnalyticsBeacon event="mcp_doc_view" />
      <SiteHeader active="buildWithAi" />

      <section className="library-hero">
        <div className="library-hero-copy">
          <span className="landing-kicker">AI coding on-ramp</span>
          <h2>Point your agent at the catalog, then make the game.</h2>
          <p>
            A copy-paste prompt, MCP config, catalog reference, and demo-repo placeholder for Claude Code, Cursor,
            Codex, and any tool that can fetch JSON.
          </p>
          <div className="library-actions">
            <Link className="landing-button primary" href="#prompt">
              Copy the prompt
            </Link>
            <ExternalLink className="landing-button secondary" href={DEMO_REPO_URL}>
              Demo repo placeholder
            </ExternalLink>
            <Link className="landing-button secondary" href={CATALOG_PATH}>
              Catalog JSON
            </Link>
          </div>
        </div>

        <div style={{ ...panelStyle, alignSelf: "center" }}>
          <div style={{ ...stackStyle, gap: 12 }}>
            <span style={eyebrowStyle}>Walkthrough video placeholder</span>
            <div
              style={{
                position: "relative",
                aspectRatio: "16 / 9",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 8,
                background: "#07080b",
              }}
            >
              <iframe
                title="Build with AI walkthrough video placeholder"
                src={VIDEO_URL_PLACEHOLDER}
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: 0,
                }}
              />
            </div>
            <p style={proseStyle}>
              The iframe intentionally uses <code style={inlineCodeStyle}>VIDEO_URL_PLACEHOLDER</code>. Rico swaps
              in the recorded walkthrough after the demo run exists.
            </p>
          </div>
        </div>
      </section>

      <div className="library-tracks">
        <section id="prompt" className="library-track" data-track="3d">
          <div className="library-track-copy">
            <span className="landing-kicker">Prompt template</span>
            <h3>Paste this into Claude Code, Cursor, or Codex.</h3>
            <p>
              It names the catalog endpoint, the placeholder demo repo, license expectations, and the minimum loop an
              agent should complete before it claims the game is done.
            </p>
          </div>
          <CodeBlock label="copy-paste prompt">{promptTemplate}</CodeBlock>
        </section>

        <section className="library-track" data-track="2d">
          <div className="library-track-copy">
            <span className="landing-kicker">MCP server</span>
            <h3>Configure the asset tools once.</h3>
            <p>
              Any MCP client that accepts stdio JSON can run the package through <code style={inlineCodeStyle}>npx</code>.
              Paste the config into <code style={inlineCodeStyle}>~/.claude/mcp.json</code>, Cursor MCP settings, or
              the equivalent Codex MCP config. The server reads the public catalog and exposes search, detail, and
              download-url tools.
            </p>
            <div className="library-track-actions">
              <ExternalLink className="landing-button primary" href={DEMO_REPO_URL}>
                Open demo repo URL
              </ExternalLink>
              <Link className="landing-button secondary" href={`${CATALOG_PATH}?schema=1`}>
                Catalog schema
              </Link>
            </div>
          </div>
          <div style={stackStyle}>
            <CodeBlock label="install">
              {`npx -y @trebeljahr/gamedev-asset-mcp
# Or leave npx in the MCP config so the client installs it on first run.`}
            </CodeBlock>
            <CodeBlock label="mcp config">{mcpConfig}</CodeBlock>
          </div>
        </section>

        <section className="library-track" data-track="sounds">
          <div className="library-track-copy">
            <span className="landing-kicker">No-agent reference</span>
            <h3>The same path works by hand.</h3>
            <p>
              Open the catalog, filter assets in your own script, download the files you need, and keep attribution next
              to the project. No MCP server is required for the underlying data.
            </p>
            <ul className="library-track-bullets">
              <li>
                Catalog: <Link href={CATALOG_PATH}>site-relative JSON endpoint</Link>
              </li>
              <li>
                Schema: <Link href={`${CATALOG_PATH}?schema=1`}>response shape for scripts and agents</Link>
              </li>
              <li>
                Demo: <ExternalLink href={DEMO_REPO_URL}>placeholder GitHub repository URL</ExternalLink>
              </li>
            </ul>
          </div>
          <CodeBlock label="fetch example">{fetchExample}</CodeBlock>
        </section>

        <section className="library-track" data-track="3d">
          <div className="library-track-copy">
            <span className="landing-kicker">Rough edges</span>
            <h3>Useful now, still honest about the gaps.</h3>
            <p>
              This page is meant to convert AI-coding curiosity into a working prototype, but a few launch pieces depend
              on adjacent tasks and Rico-only work.
            </p>
          </div>
          <div style={splitStyle}>
            <div style={panelStyle}>
              <div style={stackStyle}>
                <span style={eyebrowStyle}>Works</span>
                <ul className="library-track-bullets" style={{ marginTop: 0 }}>
                  <li>Humans can use the web catalog and download pages without an agent.</li>
                  <li>The prompt gives agents exact catalog, demo repo, license, and attribution targets.</li>
                  <li>The MCP config is client-agnostic stdio JSON for Claude Code, Cursor, Codex, and similar tools.</li>
                  <li>Placeholders are named in code instead of hidden in copy.</li>
                </ul>
              </div>
            </div>
            <div style={panelStyle}>
              <div style={stackStyle}>
                <span style={eyebrowStyle}>Not done yet</span>
                <ul className="library-track-bullets" style={{ marginTop: 0 }}>
                  <li>The demo repo URL is a placeholder until Rico creates the repository.</li>
                  <li>The walkthrough iframe points at <code style={inlineCodeStyle}>VIDEO_URL_PLACEHOLDER</code>.</li>
                  <li>The MCP package needs to be published before fresh <code style={inlineCodeStyle}>npx</code> installs work.</li>
                  <li>If <code style={inlineCodeStyle}>{CATALOG_PATH}</code> is still pre-launch, use the web catalog while the endpoint lands.</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
