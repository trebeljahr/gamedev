import { Mp3Encoder } from "@breezystack/lamejs";
import type { AudioExportWorkerMessage, AudioExportWorkerRequest } from "@/lib/audio-export";

type WorkerScope = {
  onmessage: ((event: MessageEvent<AudioExportWorkerRequest>) => void) | null;
  postMessage(message: AudioExportWorkerMessage, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

const SAMPLES_PER_FRAME = 1152;

function floatTo16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output;
}

function post(message: AudioExportWorkerMessage, transfer?: Transferable[]) {
  scope.postMessage(message, transfer);
}

function encodeMp3(request: AudioExportWorkerRequest) {
  const { channelBuffers, numChannels, sampleRate, numSamples, bitrate } = request;
  const channels: Int16Array[] = [];
  for (let c = 0; c < numChannels; c += 1) {
    const buffer = channelBuffers[c];
    if (!buffer) throw new Error(`Missing channel buffer ${c}`);
    channels.push(floatTo16(new Float32Array(buffer)));
  }

  const encoder = new Mp3Encoder(numChannels === 2 ? 2 : 1, sampleRate, bitrate);
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  let lastProgress = -1;

  for (let i = 0; i < numSamples; i += SAMPLES_PER_FRAME) {
    const end = Math.min(i + SAMPLES_PER_FRAME, numSamples);
    const left = channels[0].subarray(i, end);
    const right = numChannels === 2 ? channels[1].subarray(i, end) : undefined;
    const encoded = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left);
    if (encoded.length > 0) {
      chunks.push(encoded);
      totalLength += encoded.length;
    }
    const ratio = numSamples > 0 ? end / numSamples : 1;
    const bucket = Math.floor(ratio * 50);
    if (bucket !== lastProgress) {
      lastProgress = bucket;
      post({ kind: "progress", ratio });
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(tail);
    totalLength += tail.length;
  }

  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  post({ kind: "progress", ratio: 1 });
  post({ kind: "done", buffer: out.buffer }, [out.buffer]);
}

scope.onmessage = (event: MessageEvent<AudioExportWorkerRequest>) => {
  try {
    if (event.data?.kind === "encode-mp3") {
      encodeMp3(event.data);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    post({ kind: "error", message });
  }
};
