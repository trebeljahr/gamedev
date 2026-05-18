export type AudioExportFormat = "wav" | "mp3";

export type AudioExportStage = "decode" | "render" | "encode";

export type AudioExportProgress = {
  stage: AudioExportStage;
  ratio: number;
  message?: string;
};

export type AudioExportRequest = {
  src: string;
  format: AudioExportFormat;
  selectionStart: number;
  selectionEnd: number;
  speed: number;
  mp3Bitrate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AudioExportProgress) => void;
};

export type AudioExportResult = {
  blob: Blob;
  filename: string;
  duration: number;
};

export type AudioExportWorkerRequest = {
  kind: "encode-mp3";
  channelBuffers: ArrayBuffer[];
  numChannels: number;
  sampleRate: number;
  numSamples: number;
  bitrate: number;
};

export type AudioExportWorkerMessage =
  | { kind: "progress"; ratio: number }
  | { kind: "done"; buffer: ArrayBuffer }
  | { kind: "error"; message: string };

function encodeWav(channels: Float32Array[], sampleRate: number): Blob {
  const numChannels = channels.length;
  const numSamples = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i += 1) {
    for (let c = 0; c < numChannels; c += 1) {
      const raw = channels[c][i] ?? 0;
      const clamped = Math.max(-1, Math.min(1, raw));
      const value = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      view.setInt16(offset, value, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function safeFilename(label: string, suffix: string): string {
  const base = label.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "sample";
  return `${base}${suffix}`;
}

async function fetchBuffer(src: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`.trim());
  return response.arrayBuffer();
}

async function decodeAudio(audioCtx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    audioCtx.decodeAudioData(data.slice(0), resolve, reject);
  });
}

async function renderSelection(
  source: AudioBuffer,
  selectionStart: number,
  selectionEnd: number,
  speed: number,
): Promise<AudioBuffer> {
  const start = Math.max(0, Math.min(source.duration, selectionStart));
  const end = Math.max(start, Math.min(source.duration, selectionEnd));
  const sectionDuration = (end - start) / Math.max(0.1, speed);
  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;
  const length = Math.max(1, Math.ceil(sectionDuration * sampleRate));

  const ctx = new OfflineAudioContext(numChannels, length, sampleRate);
  const node = ctx.createBufferSource();
  node.buffer = source;
  node.playbackRate.value = speed;
  node.connect(ctx.destination);
  node.start(0, start, end - start);
  return ctx.startRendering();
}

function extractChannels(buffer: AudioBuffer): Float32Array[] {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    channels.push(buffer.getChannelData(c).slice());
  }
  return channels;
}

async function encodeMp3InWorker(
  channels: Float32Array[],
  sampleRate: number,
  bitrate: number,
  signal?: AbortSignal,
  onProgress?: (ratio: number) => void,
): Promise<Blob> {
  if (typeof Worker === "undefined") {
    throw new Error("Web Workers are not available in this environment.");
  }

  const worker = new Worker(new URL("../workers/audio-export.worker.ts", import.meta.url), {
    type: "module",
  });

  const channelBuffers = channels.map((c) => {
    const buffer = c.buffer as ArrayBuffer | SharedArrayBuffer;
    if (buffer instanceof ArrayBuffer) return buffer;
    return new Uint8Array(c.buffer as ArrayBufferLike).slice().buffer as ArrayBuffer;
  });
  const numSamples = channels[0]?.length ?? 0;

  return new Promise<Blob>((resolve, reject) => {
    let aborted = false;
    const abort = () => {
      aborted = true;
      worker.terminate();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort);

    worker.onmessage = (event: MessageEvent<AudioExportWorkerMessage>) => {
      if (aborted) return;
      const message = event.data;
      if (message.kind === "progress") {
        onProgress?.(message.ratio);
      } else if (message.kind === "done") {
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        resolve(new Blob([message.buffer], { type: "audio/mpeg" }));
      } else if (message.kind === "error") {
        signal?.removeEventListener("abort", abort);
        worker.terminate();
        reject(new Error(message.message));
      }
    };
    worker.onerror = (event) => {
      signal?.removeEventListener("abort", abort);
      worker.terminate();
      reject(new Error(event.message || "Audio export worker error"));
    };

    const request: AudioExportWorkerRequest = {
      kind: "encode-mp3",
      channelBuffers,
      numChannels: channels.length,
      sampleRate,
      numSamples,
      bitrate,
    };
    worker.postMessage(request, channelBuffers);
  });
}

export async function exportAudioSelection(request: AudioExportRequest): Promise<AudioExportResult> {
  const { src, format, selectionStart, selectionEnd, speed, signal, onProgress } = request;
  const mp3Bitrate = request.mp3Bitrate ?? 192;

  onProgress?.({ stage: "decode", ratio: 0, message: "Downloading sample" });
  const data = await fetchBuffer(src, signal);
  onProgress?.({ stage: "decode", ratio: 0.5, message: "Decoding audio" });

  const AudioCtor: typeof AudioContext | undefined =
    (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
      .AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) throw new Error("Web Audio is not available in this browser.");
  const audioCtx = new AudioCtor();
  let source: AudioBuffer;
  try {
    source = await decodeAudio(audioCtx, data);
  } finally {
    void audioCtx.close().catch(() => undefined);
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  onProgress?.({ stage: "render", ratio: 0, message: "Rendering selection" });
  const rendered = await renderSelection(source, selectionStart, selectionEnd, speed);
  onProgress?.({ stage: "render", ratio: 1, message: "Render complete" });
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const channels = extractChannels(rendered);
  const duration = rendered.duration;
  const label = safeFilename(src.split("/").pop() ?? "sample", "");

  if (format === "wav") {
    onProgress?.({ stage: "encode", ratio: 0, message: "Writing WAV" });
    const blob = encodeWav(channels, rendered.sampleRate);
    onProgress?.({ stage: "encode", ratio: 1, message: "Done" });
    return { blob, filename: `${label}.wav`, duration };
  }

  onProgress?.({ stage: "encode", ratio: 0, message: "Encoding MP3" });
  const blob = await encodeMp3InWorker(channels, rendered.sampleRate, mp3Bitrate, signal, (ratio) => {
    onProgress?.({ stage: "encode", ratio, message: "Encoding MP3" });
  });
  onProgress?.({ stage: "encode", ratio: 1, message: "Done" });
  return { blob, filename: `${label}.mp3`, duration };
}
