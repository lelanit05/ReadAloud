const TARGET_RATE = 16000;

let transcriberPromise = null;

export function preloadWhisper(onStatus = () => {}) {
  if (!transcriberPromise) transcriberPromise = loadTranscriber(onStatus);
  return transcriberPromise;
}

async function loadTranscriber(onStatus) {
  onStatus("Đang tải model nhận giọng (chỉ lần đầu)…");
  const { pipeline, env } = await import(
    "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2"
  );
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  return pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en", {
    quantized: true,
    progress_callback: (progress) => {
      if (progress.status === "progress" && progress.total) {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        onStatus(`Đang tải model nhận giọng… ${pct}%`);
      }
    },
  });
}

export async function transcribeAudioBlob(blob, onStatus = () => {}) {
  const transcriber = await preloadWhisper(onStatus);
  onStatus("Đang nhận lời nói…");
  const audio = await decodeToMono16k(blob);
  if (audio.length < TARGET_RATE * 0.3) {
    throw new Error("Đoạn ghi quá ngắn. Giữ mic, đọc hết câu, rồi bấm Dừng.");
  }
  const result = await transcriber(audio, {
    language: "english",
    task: "transcribe",
  });
  const text = (Array.isArray(result) ? result[0]?.text : result?.text) || "";
  return text.trim();
}

async function decodeToMono16k(blob) {
  const buffer = await blob.arrayBuffer();
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(buffer.slice(0));
  await ctx.close();
  const mono = decoded.numberOfChannels === 1 ? decoded.getChannelData(0) : mixMono(decoded);
  return resample(mono, decoded.sampleRate, TARGET_RATE);
}

function mixMono(decoded) {
  const a = decoded.getChannelData(0);
  const b = decoded.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i += 1) out[i] = (a[i] + b[i]) * 0.5;
  return out;
}

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.round(input.length / ratio));
  for (let i = 0; i < out.length; i += 1) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = x - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}
