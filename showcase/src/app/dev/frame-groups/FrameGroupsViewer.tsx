"use client";

import { useEffect, useMemo, useState } from "react";

type Classification = "animation" | "atlas" | "ambiguous";

type GroupResult = {
  packFolder: string;
  designKey: string;
  frameCount: number;
  paths: string[];
  consecHammingMean: number | null;
  consecHammingMax: number | null;
  pairwiseHammingMean: number | null;
  hasActionWord: boolean;
  hasAtlasWord: boolean;
  hasVariantWord: boolean;
  hasColorToken: boolean;
  dimUniform: boolean;
  parentFolder: string;
  parentIsAction: boolean;
  parentIsColor: boolean;
  frameNumberMonotonic: boolean;
  bgTransparentAll: boolean;
  classification: Classification;
  score: number;
  reasons: string[];
};

type Report = {
  counts: { total: number; animation: number; atlas: number; ambiguous: number };
  byPack: Record<
    string,
    { animation: number; atlas: number; ambiguous: number; groups: GroupResult[] }
  >;
};

type Verdict = "correct" | "should-animation" | "should-atlas" | "should-ambiguous";
type VerdictMap = Record<string, Verdict>;

const STORAGE_KEY = "frame-groups-verdicts-v1";

function groupId(g: GroupResult): string {
  return `${g.packFolder}::${g.designKey}::${g.paths[0]}`;
}

const CLASS_COLORS: Record<Classification, string> = {
  animation: "#22c55e",
  atlas: "#f59e0b",
  ambiguous: "#64748b",
};

const VERDICT_COLORS: Record<Verdict, string> = {
  correct: "#10b981",
  "should-animation": "#22c55e",
  "should-atlas": "#f59e0b",
  "should-ambiguous": "#64748b",
};

export default function FrameGroupsViewer() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<VerdictMap>({});
  const [filter, setFilter] = useState<"all" | Classification | "unverdicted" | "verdicted" | "wrong">("all");
  const [packFilter, setPackFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [framesLimit, setFramesLimit] = useState<number>(16);
  const [page, setPage] = useState<number>(0);
  const pageSize = 50;

  useEffect(() => {
    fetch("/api/dev/frame-groups", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
        return res.json();
      })
      .then(setReport)
      .catch((err) => setError(err.message));
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setVerdicts(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(verdicts));
    } catch {}
  }, [verdicts]);

  const allGroups = useMemo(() => {
    if (!report) return [];
    const all: GroupResult[] = [];
    for (const bucket of Object.values(report.byPack)) all.push(...bucket.groups);
    return all;
  }, [report]);

  const packNames = useMemo(() => {
    if (!report) return [];
    return Object.keys(report.byPack).sort();
  }, [report]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (packFilter && g.packFolder !== packFilter) return false;
      const v = verdicts[groupId(g)];
      if (filter === "all") {
        /* pass */
      } else if (filter === "unverdicted") {
        if (v) return false;
      } else if (filter === "verdicted") {
        if (!v) return false;
      } else if (filter === "wrong") {
        if (!v || v === "correct") return false;
      } else if (filter !== g.classification) {
        return false;
      }
      if (q) {
        if (
          !g.designKey.toLowerCase().includes(q) &&
          !g.packFolder.toLowerCase().includes(q) &&
          !g.paths[0].toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [allGroups, filter, packFilter, search, verdicts]);

  const pageItems = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  useEffect(() => {
    setPage(0);
  }, [filter, packFilter, search]);

  const verdictStats = useMemo(() => {
    let correct = 0;
    let wrong = 0;
    for (const v of Object.values(verdicts)) {
      if (v === "correct") correct++;
      else wrong++;
    }
    return { correct, wrong, total: Object.keys(verdicts).length };
  }, [verdicts]);

  function setVerdict(id: string, v: Verdict | null): void {
    setVerdicts((prev) => {
      const next = { ...prev };
      if (v === null) delete next[id];
      else next[id] = v;
      return next;
    });
  }

  function exportVerdicts(): void {
    const enriched = allGroups
      .filter((g) => verdicts[groupId(g)])
      .map((g) => ({
        packFolder: g.packFolder,
        designKey: g.designKey,
        firstPath: g.paths[0],
        frameCount: g.frameCount,
        classification: g.classification,
        verdict: verdicts[groupId(g)],
        score: g.score,
        reasons: g.reasons,
      }));
    const blob = new Blob([JSON.stringify(enriched, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "frame-group-verdicts.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyVerdicts(): void {
    const enriched = allGroups
      .filter((g) => verdicts[groupId(g)])
      .map((g) => ({
        packFolder: g.packFolder,
        designKey: g.designKey,
        firstPath: g.paths[0],
        classification: g.classification,
        verdict: verdicts[groupId(g)],
      }));
    navigator.clipboard.writeText(JSON.stringify(enriched, null, 2));
  }

  function clearVerdicts(): void {
    if (!confirm("Clear all verdicts?")) return;
    setVerdicts({});
  }

  if (error) {
    return (
      <main style={{ padding: 24, fontFamily: "ui-monospace, monospace", color: "#fca5a5" }}>
        <h1>Error loading report</h1>
        <pre>{error}</pre>
        <p>Run the analysis first:</p>
        <pre>cd showcase && ASSETS_DIR=../assets pnpm exec tsx scripts/analyze-frame-groups.ts</pre>
      </main>
    );
  }

  if (!report) {
    return (
      <main style={{ padding: 24, fontFamily: "ui-monospace, monospace" }}>
        Loading report…
      </main>
    );
  }

  return (
    <main
      style={{
        padding: 16,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        color: "#e2e8f0",
        background: "#0f172a",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: "0 0 12px" }}>Frame Groups — classification review (dev)</h1>
      <section
        style={{
          display: "flex",
          gap: 24,
          flexWrap: "wrap",
          marginBottom: 16,
          fontSize: 13,
        }}
      >
        <div>
          <strong>Total:</strong> {report.counts.total}
        </div>
        <div style={{ color: CLASS_COLORS.animation }}>
          <strong>Animation:</strong> {report.counts.animation}
        </div>
        <div style={{ color: CLASS_COLORS.atlas }}>
          <strong>Atlas:</strong> {report.counts.atlas}
        </div>
        <div style={{ color: CLASS_COLORS.ambiguous }}>
          <strong>Ambiguous:</strong> {report.counts.ambiguous}
        </div>
        <div>
          <strong>Verdicts:</strong> {verdictStats.total} ({verdictStats.correct} ✓ /{" "}
          {verdictStats.wrong} ✗)
        </div>
      </section>

      <section
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        {(["all", "animation", "atlas", "ambiguous", "unverdicted", "verdicted", "wrong"] as const).map(
          (f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              style={{
                padding: "4px 10px",
                borderRadius: 4,
                border: "1px solid #334155",
                background: filter === f ? "#1e293b" : "transparent",
                color: "#e2e8f0",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
              }}
            >
              {f}
            </button>
          ),
        )}
        <select
          value={packFilter}
          onChange={(e) => setPackFilter(e.target.value)}
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            padding: "4px 6px",
            fontFamily: "inherit",
            fontSize: 12,
          }}
        >
          <option value="">all packs</option>
          {packNames.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#1e293b",
            color: "#e2e8f0",
            border: "1px solid #334155",
            padding: "4px 8px",
            fontFamily: "inherit",
            fontSize: 12,
            minWidth: 200,
          }}
        />
        <label style={{ fontSize: 12 }}>
          frames:
          <input
            type="number"
            min={4}
            max={64}
            value={framesLimit}
            onChange={(e) => setFramesLimit(Math.max(4, Math.min(64, Number(e.target.value) || 16)))}
            style={{
              width: 50,
              marginLeft: 4,
              background: "#1e293b",
              color: "#e2e8f0",
              border: "1px solid #334155",
              padding: "2px 4px",
              fontFamily: "inherit",
            }}
          />
        </label>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" onClick={copyVerdicts} style={btnStyle}>
            copy verdicts
          </button>
          <button type="button" onClick={exportVerdicts} style={btnStyle}>
            download verdicts
          </button>
          <button type="button" onClick={clearVerdicts} style={{ ...btnStyle, color: "#fca5a5" }}>
            clear
          </button>
        </div>
      </section>

      <section style={{ marginBottom: 8, fontSize: 12, color: "#94a3b8" }}>
        Showing {pageItems.length} of {filtered.length} groups · page {page + 1}/{pageCount}
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={pagerStyle}>
          ◀
        </button>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
          style={pagerStyle}
        >
          ▶
        </button>
      </section>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {pageItems.map((g) => (
          <GroupCard
            key={groupId(g)}
            group={g}
            verdict={verdicts[groupId(g)]}
            framesLimit={framesLimit}
            onVerdict={(v) => setVerdict(groupId(g), v)}
          />
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)} style={pagerStyle}>
          ◀
        </button>
        <span style={{ margin: "0 8px", fontSize: 12, color: "#94a3b8" }}>
          page {page + 1}/{pageCount}
        </span>
        <button
          type="button"
          disabled={page >= pageCount - 1}
          onClick={() => setPage((p) => p + 1)}
          style={pagerStyle}
        >
          ▶
        </button>
      </div>
    </main>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: 4,
  border: "1px solid #334155",
  background: "#1e293b",
  color: "#e2e8f0",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: 12,
};

const pagerStyle: React.CSSProperties = {
  ...btnStyle,
  padding: "2px 8px",
  marginLeft: 4,
};

function GroupCard({
  group,
  verdict,
  framesLimit,
  onVerdict,
}: {
  group: GroupResult;
  verdict: Verdict | undefined;
  framesLimit: number;
  onVerdict: (v: Verdict | null) => void;
}) {
  const accent = verdict ? VERDICT_COLORS[verdict] : CLASS_COLORS[group.classification];
  const shown = group.paths.slice(0, framesLimit);
  const remaining = group.paths.length - shown.length;

  return (
    <div
      style={{
        border: `1px solid ${accent}`,
        borderRadius: 6,
        padding: 10,
        background: "#0b1220",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "baseline" }}>
        <span
          style={{
            background: CLASS_COLORS[group.classification],
            color: "#0f172a",
            padding: "2px 8px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
          }}
        >
          {group.classification} · {group.score}
        </span>
        <strong style={{ fontSize: 13 }}>{group.packFolder}</strong>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>
          key: <em style={{ color: "#cbd5e1" }}>{group.designKey || "(empty)"}</em>
        </span>
        <span style={{ fontSize: 12, color: "#94a3b8" }}>n={group.frameCount}</span>
        {group.consecHammingMean !== null && (
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            consec-hamming={group.consecHammingMean.toFixed(3)}
          </span>
        )}
        {verdict && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 4,
              background: VERDICT_COLORS[verdict],
              color: "#0f172a",
              fontWeight: 700,
            }}
          >
            {verdict}
          </span>
        )}
      </div>

      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, fontFamily: "inherit" }}>
        {group.reasons.join(" · ")}
      </div>

      <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
        first: {group.paths[0]}
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          marginTop: 8,
          background: "#020617",
          padding: 6,
          borderRadius: 4,
        }}
      >
        {shown.map((p, i) => (
          <img
            key={p + i}
            src={`/api/dev/asset?path=${encodeURIComponent(p)}`}
            alt={p}
            title={p}
            style={{
              width: 72,
              height: 72,
              objectFit: "contain",
              background:
                "repeating-conic-gradient(#1f2937 0% 25%, #111827 0% 50%) 50% / 12px 12px",
              imageRendering: "pixelated",
              border: "1px solid #1f2937",
            }}
          />
        ))}
        {remaining > 0 && (
          <div
            style={{
              width: 72,
              height: 72,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#64748b",
              border: "1px dashed #334155",
              fontSize: 12,
            }}
          >
            +{remaining}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => onVerdict(verdict === "correct" ? null : "correct")}
          style={verdictBtn(verdict === "correct", VERDICT_COLORS.correct)}
        >
          ✓ correct
        </button>
        <button
          type="button"
          onClick={() =>
            onVerdict(verdict === "should-animation" ? null : "should-animation")
          }
          style={verdictBtn(verdict === "should-animation", VERDICT_COLORS["should-animation"])}
        >
          should be ANIM
        </button>
        <button
          type="button"
          onClick={() => onVerdict(verdict === "should-atlas" ? null : "should-atlas")}
          style={verdictBtn(verdict === "should-atlas", VERDICT_COLORS["should-atlas"])}
        >
          should be ATLAS
        </button>
        <button
          type="button"
          onClick={() =>
            onVerdict(verdict === "should-ambiguous" ? null : "should-ambiguous")
          }
          style={verdictBtn(verdict === "should-ambiguous", VERDICT_COLORS["should-ambiguous"])}
        >
          should be AMBIG
        </button>
      </div>
    </div>
  );
}

function verdictBtn(active: boolean, color: string): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 4,
    border: `1px solid ${color}`,
    background: active ? color : "transparent",
    color: active ? "#0f172a" : color,
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: 12,
    fontWeight: active ? 700 : 400,
  };
}
