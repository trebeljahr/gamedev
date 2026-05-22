"use client";

import Link from "next/link";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { LicenseLink } from "@/components/LicenseLink";
import { cleanAudioLabel } from "@/lib/audio-label";
import {
  exportAudioSelection,
  type AudioExportFormat,
  type AudioExportProgress,
} from "@/lib/audio-export";
import type { AudioAnalysis, SoundCollection, SoundSample } from "@/lib/media";
import { mediaPackHref } from "@/lib/media";
import { useLoudnessEnvelope, waveformPath } from "@/lib/loudness";

type AudioSelection = { start: number; end: number };

function formatTime(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function AudioPlayer({
  src,
  title,
  detail,
  volume = 0.8,
  rate = 1,
  loop = false,
  playSignal = 0,
  compact = false,
  audio,
  selection,
  onSelectionChange,
  onDurationChange,
}: {
  src: string | undefined;
  title: string;
  detail?: ReactNode;
  volume?: number;
  rate?: number;
  loop?: boolean;
  playSignal?: number;
  compact?: boolean;
  audio?: AudioAnalysis;
  selection?: AudioSelection;
  onSelectionChange?: (next: AudioSelection) => void;
  onDurationChange?: (duration: number) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformShellRef = useRef<HTMLDivElement | null>(null);
  const waveformClipId = `audio-waveform-${useId().replace(/:/g, "")}`;
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const waveBucketCount = compact ? 160 : 224;
  const loudnessEnvelope = useLoudnessEnvelope(`${src ?? ""}|${title}`, waveBucketCount, audio);
  const waveform = useMemo(() => waveformPath(loudnessEnvelope), [loudnessEnvelope]);
  const progress = duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;
  const progressStyle = { "--progress": `${progress}%` } as CSSProperties;
  const waveformClipWidth = (progress / 100) * 1000;

  const hasSelection = Boolean(selection && onSelectionChange);
  const effectiveSelection = useMemo<AudioSelection | null>(() => {
    if (!hasSelection || !selection || duration <= 0) return null;
    const start = clamp(selection.start, 0, duration);
    const end = clamp(selection.end > start ? selection.end : duration, start, duration);
    return { start, end };
  }, [hasSelection, selection, duration]);
  const selectionStartPct = effectiveSelection && duration > 0 ? (effectiveSelection.start / duration) * 100 : 0;
  const selectionEndPct = effectiveSelection && duration > 0 ? (effectiveSelection.end / duration) * 100 : 100;

  function setMediaDuration(value: number) {
    const next = Number.isFinite(value) && value > 0 ? value : 0;
    setDuration(next);
    if (next > 0) onDurationChange?.(next);
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.playbackRate = rate;
    audio.loop = false;
  }, [rate, volume]);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !src || playSignal === 0) return;
    audio.currentTime = effectiveSelection?.start ?? 0;
    const playPromise = audio.play();
    void playPromise?.catch(() => setPlaying(false));
  }, [playSignal, src, effectiveSelection?.start]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      const target = audio.currentTime || 0;
      if (effectiveSelection && target >= effectiveSelection.end - 0.005) {
        if (loop) {
          audio.currentTime = effectiveSelection.start;
          setCurrentTime(effectiveSelection.start);
        } else {
          audio.pause();
          setCurrentTime(effectiveSelection.end);
          return;
        }
      } else if (!effectiveSelection && loop && duration > 0 && target >= duration - 0.005) {
        audio.currentTime = 0;
        setCurrentTime(0);
      } else {
        setCurrentTime((previous) => {
          if (!Number.isFinite(previous) || Math.abs(target - previous) > 0.35) return target;
          const eased = previous + (target - previous) * 0.45;
          return Math.abs(eased - target) < 0.004 ? target : eased;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, effectiveSelection, loop, duration]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;
    if (audio.paused) {
      if (effectiveSelection) {
        const t = audio.currentTime;
        if (t < effectiveSelection.start || t >= effectiveSelection.end - 0.005) {
          audio.currentTime = effectiveSelection.start;
        }
      }
      void audio.play().catch(() => setPlaying(false));
    } else {
      audio.pause();
    }
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(duration)) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  function beginHandleDrag(which: "start" | "end") {
    return (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!effectiveSelection || !onSelectionChange || !waveformShellRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      const shell = waveformShellRef.current;
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        // ignore
      }
      const updateFromClientX = (clientX: number) => {
        const rect = shell.getBoundingClientRect();
        const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
        const value = ratio * duration;
        const minGap = Math.min(0.1, duration * 0.01);
        if (which === "start") {
          const next = clamp(value, 0, effectiveSelection.end - minGap);
          onSelectionChange({ start: next, end: effectiveSelection.end });
        } else {
          const next = clamp(value, effectiveSelection.start + minGap, duration);
          onSelectionChange({ start: effectiveSelection.start, end: next });
        }
      };
      updateFromClientX(event.clientX);
      const move = (ev: PointerEvent) => updateFromClientX(ev.clientX);
      const up = () => {
        try {
          target.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    };
  }

  return (
    <div className={`audio-player ${compact ? "compact" : ""} ${playing ? "playing" : ""} ${effectiveSelection ? "has-selection" : ""}`}>
      <audio
        ref={audioRef}
        preload="none"
        src={src}
        onDurationChange={(event) => setMediaDuration(event.currentTarget.duration)}
        onLoadedMetadata={(event) => setMediaDuration(event.currentTarget.duration)}
        onPlay={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
          setPlaying(true);
        }}
        onPause={(event) => {
          setCurrentTime(event.currentTarget.currentTime || 0);
          setPlaying(false);
        }}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onTimeUpdate={(event) => {
          if (!playing) setCurrentTime(event.currentTarget.currentTime || 0);
        }}
      />
      <button className="transport-button" type="button" onClick={togglePlay} disabled={!src} aria-label={playing ? "Pause audio" : "Play audio"}>
        <span className={playing ? "pause-glyph" : "play-glyph"} aria-hidden="true" />
      </button>
      <div className="audio-main">
        <div className="audio-meta">
          <div>
            <span>{playing ? "Playing" : "Ready"}</span>
            <strong>{title}</strong>
            {detail && <small>{detail}</small>}
          </div>
          <div className="audio-time">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
        </div>
        <div className="audio-strip">
          <div className="audio-waveform-shell" style={progressStyle} ref={waveformShellRef}>
            <svg className="audio-waveform" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <clipPath id={waveformClipId}>
                  <rect x="0" y="0" width={waveformClipWidth} height="100" />
                </clipPath>
              </defs>
              <line className="audio-waveform-midline" x1="0" y1="50" x2="1000" y2="50" />
              <path className="audio-waveform-path audio-waveform-base" d={waveform} />
              <path className="audio-waveform-path audio-waveform-played" clipPath={`url(#${waveformClipId})`} d={waveform} />
            </svg>
            {effectiveSelection && (
              <>
                <div className="audio-selection-mask audio-selection-mask-left" style={{ width: `${selectionStartPct}%` }} aria-hidden="true" />
                <div
                  className="audio-selection-mask audio-selection-mask-right"
                  style={{ left: `${selectionEndPct}%`, width: `${100 - selectionEndPct}%` }}
                  aria-hidden="true"
                />
                <div
                  className="audio-selection-region"
                  style={{ left: `${selectionStartPct}%`, width: `${selectionEndPct - selectionStartPct}%` }}
                  aria-hidden="true"
                />
              </>
            )}
            <input
              aria-label={`Seek ${title}`}
              className="audio-seeker"
              type="range"
              min="0"
              max={duration || 0}
              step="0.01"
              value={duration ? currentTime : 0}
              onChange={(event) => seek(Number(event.target.value))}
              disabled={!src || duration <= 0}
            />
            {effectiveSelection && (
              <>
                <div
                  className="audio-selection-handle audio-selection-handle-start"
                  style={{ left: `${selectionStartPct}%` }}
                  role="slider"
                  aria-label="Selection start"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={effectiveSelection.start}
                  tabIndex={0}
                  onPointerDown={beginHandleDrag("start")}
                  onKeyDown={(event) => {
                    if (!onSelectionChange) return;
                    const step = event.shiftKey ? 1 : 0.1;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onSelectionChange({
                        start: clamp(effectiveSelection.start - step, 0, effectiveSelection.end - 0.1),
                        end: effectiveSelection.end,
                      });
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onSelectionChange({
                        start: clamp(effectiveSelection.start + step, 0, effectiveSelection.end - 0.1),
                        end: effectiveSelection.end,
                      });
                    }
                  }}
                >
                  <span className="audio-selection-handle-label">{formatTime(effectiveSelection.start)}</span>
                </div>
                <div
                  className="audio-selection-handle audio-selection-handle-end"
                  style={{ left: `${selectionEndPct}%` }}
                  role="slider"
                  aria-label="Selection end"
                  aria-valuemin={0}
                  aria-valuemax={duration}
                  aria-valuenow={effectiveSelection.end}
                  tabIndex={0}
                  onPointerDown={beginHandleDrag("end")}
                  onKeyDown={(event) => {
                    if (!onSelectionChange) return;
                    const step = event.shiftKey ? 1 : 0.1;
                    if (event.key === "ArrowLeft") {
                      event.preventDefault();
                      onSelectionChange({
                        start: effectiveSelection.start,
                        end: clamp(effectiveSelection.end - step, effectiveSelection.start + 0.1, duration),
                      });
                    } else if (event.key === "ArrowRight") {
                      event.preventDefault();
                      onSelectionChange({
                        start: effectiveSelection.start,
                        end: clamp(effectiveSelection.end + step, effectiveSelection.start + 0.1, duration),
                      });
                    }
                  }}
                >
                  <span className="audio-selection-handle-label">{formatTime(effectiveSelection.end)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type SoundPadProps = {
  collection: SoundCollection;
  initialSamplePath?: string;
  packHref?: string | null;
};

export function SoundPad({ collection, initialSamplePath, packHref }: SoundPadProps) {
  const [sample, setSample] = useState<SoundSample | undefined>(
    collection.samples.find((item) => item.path === initialSamplePath) ?? collection.samples[0],
  );
  const [volume, setVolume] = useState(0.8);
  const [rate, setRate] = useState(1);
  const [loop, setLoop] = useState(false);
  const [playSignal, setPlaySignal] = useState(0);
  const [selection, setSelection] = useState<AudioSelection | null>(null);
  const [sampleDuration, setSampleDuration] = useState(0);
  const [downloadFormat, setDownloadFormat] = useState<AudioExportFormat>("mp3");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportProgress, setExportProgress] = useState<AudioExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const resolvedPackHref = packHref === undefined ? mediaPackHref("sound", collection.id) : packHref;

  useEffect(() => {
    setSample(collection.samples.find((item) => item.path === initialSamplePath) ?? collection.samples[0]);
    setPlaySignal(0);
    setSelection(null);
    setSampleDuration(0);
  }, [collection.id, collection.samples, initialSamplePath]);

  useEffect(() => {
    setSelection(null);
    setSampleDuration(0);
    setExportError(null);
    setExportProgress(null);
  }, [sample?.src]);

  useEffect(() => {
    return () => {
      exportAbortRef.current?.abort();
    };
  }, []);

  function play(next: SoundSample | undefined = sample) {
    if (!next) return;
    setSample(next);
    setPlaySignal((value) => value + 1);
  }

  function handleDurationChange(value: number) {
    setSampleDuration(value);
    setSelection((current) => current ?? { start: 0, end: value });
  }

  function clearSelection() {
    setSelection(null);
  }

  async function handleDownload() {
    if (!sample?.src || sampleDuration <= 0 || exportBusy) return;
    setExportError(null);
    setExportBusy(true);
    const controller = new AbortController();
    exportAbortRef.current = controller;
    const selectionStart = selection?.start ?? 0;
    const selectionEnd = selection?.end ?? sampleDuration;
    try {
      const result = await exportAudioSelection({
        src: sample.src,
        format: downloadFormat,
        selectionStart,
        selectionEnd,
        speed: rate,
        signal: controller.signal,
        onProgress: (progress) => setExportProgress(progress),
      });
      const url = URL.createObjectURL(result.blob);
      const baseLabel = (sample.label || sample.path.split("/").pop() || "sample").replace(/\.[^.]+$/, "");
      const safeLabel = baseLabel.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "sample";
      const speedTag = rate !== 1 ? `-${rate.toFixed(2)}x` : "";
      const trimTag = selection ? `-${Math.round(selectionStart * 1000)}-${Math.round(selectionEnd * 1000)}ms` : "";
      const filename = `${safeLabel}${trimTag}${speedTag}.${downloadFormat}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (error) {
      if ((error as DOMException)?.name === "AbortError") {
        // ignore user-initiated cancellation
      } else {
        setExportError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (exportAbortRef.current === controller) exportAbortRef.current = null;
      setExportBusy(false);
      setExportProgress(null);
    }
  }

  function cancelDownload() {
    exportAbortRef.current?.abort();
  }

  const selectionDuration = selection ? Math.max(0, selection.end - selection.start) : sampleDuration;
  const exportDuration = rate > 0 ? selectionDuration / rate : selectionDuration;
  const hasNonTrivialSelection =
    Boolean(selection) && sampleDuration > 0 && (selection!.start > 0.01 || selection!.end < sampleDuration - 0.01);
  const canDownload = Boolean(sample?.src) && sampleDuration > 0 && selectionDuration > 0.05;
  const progressLabel = exportProgress
    ? `${exportProgress.message ?? exportProgress.stage} / ${Math.round(exportProgress.ratio * 100)}%`
    : null;
  const progressBarValue = exportProgress
    ? exportProgress.stage === "decode"
      ? exportProgress.ratio * 0.25
      : exportProgress.stage === "render"
        ? 0.25 + exportProgress.ratio * 0.25
        : 0.5 + exportProgress.ratio * 0.5
    : 0;

  return (
    <section className="sound-pad">
      <div className="sound-pad-head">
        <div>
          <h3>{collection.title}</h3>
          <div className="media-detail">
            {collection.organizationLabel} / {collection.source} /{" "}
            <LicenseLink
              license={collection.license}
              source={collection.source}
              fallbackUrl={collection.url}
              className="inline-license-link"
              fallbackElement="span"
            />
            {resolvedPackHref && (
              <>
                {" "}/ <Link href={resolvedPackHref}>Pack page</Link>
              </>
            )}
            {collection.url && (
              <>
                {" "}/{" "}
                <a href={collection.url} target="_blank" rel="noreferrer">
                  Source
                </a>
              </>
            )}
          </div>
        </div>
      </div>
      <AudioPlayer
        src={sample?.src}
        title={sample ? cleanAudioLabel(sample.label) : "No sample selected"}
        detail={sample ? `${sample.kind} / ${sample.path.split("/").pop()}` : undefined}
        volume={volume}
        rate={rate}
        loop={loop}
        playSignal={playSignal}
        audio={sample?.audio}
        selection={selection ?? undefined}
        onSelectionChange={setSelection}
        onDurationChange={handleDurationChange}
      />
      <div className="sound-controls">
        <label>
          Volume
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
        </label>
        <label>
          Speed
          <input type="range" min="0.5" max="1.5" step="0.05" value={rate} onChange={(event) => setRate(Number(event.target.value))} />
        </label>
        <label className="inline-check">
          <input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />
          Loop
        </label>
        {sampleDuration > 0 && (
          <div className="sound-selection-info">
            <span>Selection</span>
            <strong>
              {formatTime(selection?.start ?? 0)} - {formatTime(selection?.end ?? sampleDuration)}
              <small>
                {" "}({selectionDuration.toFixed(2)}s
                {rate !== 1 ? ` / ${exportDuration.toFixed(2)}s @ ${rate.toFixed(2)}x` : ""})
              </small>
            </strong>
            <button
              type="button"
              className="sound-selection-reset"
              onClick={clearSelection}
              disabled={!hasNonTrivialSelection}
            >
              Reset selection
            </button>
          </div>
        )}
      </div>
      {sample?.src && (
        <div className="sound-download">
          <div className="sound-download-head">
            <div className="sound-download-summary">
              <span>Download selection</span>
              <strong>
                {selectionDuration > 0 ? `${exportDuration.toFixed(2)}s` : "-"}
                {rate !== 1 && <small> @ {rate.toFixed(2)}x</small>}
              </strong>
            </div>
            <div className="sound-download-actions">
              <label className="sound-download-format">
                Format
                <select
                  value={downloadFormat}
                  onChange={(event) => setDownloadFormat(event.target.value as AudioExportFormat)}
                  disabled={exportBusy}
                >
                  <option value="mp3">MP3</option>
                  <option value="wav">WAV (lossless)</option>
                </select>
              </label>
              {exportBusy ? (
                <button type="button" className="sound-download-button danger" onClick={cancelDownload}>
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  className="sound-download-button primary"
                  onClick={handleDownload}
                  disabled={!canDownload}
                >
                  Download {downloadFormat.toUpperCase()}
                </button>
              )}
            </div>
          </div>
          {(exportBusy || exportProgress || exportError) && (
            <div className="sound-download-progress" role="status" aria-live="polite">
              {exportBusy && (
                <>
                  <div className="sound-download-bar">
                    <div
                      className="sound-download-bar-fill"
                      style={{ width: `${Math.round(progressBarValue * 100)}%` }}
                    />
                  </div>
                  <span className="sound-download-stage">
                    {progressLabel ?? "Preparing..."}
                  </span>
                </>
              )}
              {!exportBusy && exportError && (
                <span className="sound-download-error">Export failed: {exportError}</span>
              )}
            </div>
          )}
          <p className="sound-download-hint">
            MP3 encoding happens in a background worker so the UI stays responsive. WAV is lossless but larger.
            Source audio is unchanged; re-select to export a different range.
          </p>
        </div>
      )}
      <div className="sound-buttons">
        {collection.samples.length > 0 ? (
          collection.samples.map((item) => (
            <button key={item.path} type="button" className={item.path === sample?.path ? "active" : ""} onClick={() => play(item)}>
              <span>{item.kind}</span>
              {cleanAudioLabel(item.label)}
            </button>
          ))
        ) : (
          <div className="empty-preview">No sample files in preview manifest.</div>
        )}
      </div>
    </section>
  );
}
