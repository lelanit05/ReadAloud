const TARGET_RATE = 16000;

let transcriberPromise = null;

export function concatPcm(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

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
  // GitHub Pages is not cross-origin isolated; threaded WASM fails on phones.
  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.numThreads = 1;
    env.backends.onnx.wasm.proxy = false;
  }

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

function boostWaveform(pcm, inputRate) {
  const audio = inputRate === TARGET_RATE ? new Float32Array(pcm) : resample(pcm, inputRate, TARGET_RATE);
  let mean = 0;
  for (let i = 0; i < audio.length; i += 1) mean += audio[i];
  mean /= audio.length || 1;
  let peak = 0;
  for (let i = 0; i < audio.length; i += 1) {
    audio[i] -= mean;
    peak = Math.max(peak, Math.abs(audio[i]));
  }
  if (peak < 0.004) {
    throw new Error("Đã bật mic nhưng tiếng quá nhỏ. Nói sát micro hơn, tắt loa ngoài (tránh vọng), rồi thử lại.");
  }
  const gain = Math.min(0.85 / peak, 25);
  for (let i = 0; i < audio.length; i += 1) audio[i] *= gain;
  return audio;
}

export async function transcribePcm(pcm, inputRate, onStatus = () => {}) {
  const audio = boostWaveform(pcm, inputRate);
  if (audio.length < TARGET_RATE * 0.5) {
    throw new Error("Đoạn ghi quá ngắn. Giữ mic, đọc hết câu, rồi bấm Dừng.");
  }

  onStatus("Đang nhận lời nói…");
  try {
    const transcriber = await preloadWhisper(onStatus);
    // Do not pass language/task: whisper-tiny.en breaks on those prompts.
    const result = await transcriber(audio);
    const text = (Array.isArray(result) ? result[0]?.text : result?.text) || "";
    return text.trim();
  } catch (error) {
    transcriberPromise = null;
    const message = String(error?.message || error);
    if (/fetch|network|Load|404|Failed/i.test(message)) {
      throw new Error("Không tải được model nhận giọng (cần mạng ổn định lần đầu). Thử Wi‑Fi rồi đọc lại.");
    }
    throw new Error(message || "Model nhận giọng lỗi trên trình duyệt này.");
  }
}

function resample(input, fromRate, toRate) {
  if (fromRate === toRate) return input;
  const ratio = fromRate / toRate;
  const out = new Float32Array(Math.max(1, Math.round(input.length / ratio)));
  for (let i = 0; i < out.length; i += 1) {
    const x = i * ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const t = x - i0;
    out[i] = input[i0] * (1 - t) + input[i1] * t;
  }
  return out;
}
