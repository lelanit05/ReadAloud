import { concatPcm, preloadWhisper, transcribePcm } from "./whisper.js";

function speechCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function speechSupported() {
  return Boolean(speechCtor()) || Boolean(navigator.mediaDevices?.getUserMedia);
}

export function isIOS() {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobile() {
  return isIOS() || /Android|Mobile/i.test(navigator.userAgent);
}

function pageUrl() {
  return window.location.origin + window.location.pathname;
}

export function micBlockedReason() {
  if (window.self !== window.top) {
    return `Trang đang mở trong preview (iframe). Micro bị chặn. Mở Chrome tại ${pageUrl()}`;
  }
  if (!window.isSecureContext) {
    return "Trình duyệt chặn micro vì trang không an toàn. Dùng HTTPS hoặc http://127.0.0.1:5173 trong Chrome.";
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Trình duyệt này không cho dùng micro. Hãy mở Google Chrome.";
  }
  return "";
}

export function explainMicError(error) {
  const blocked = micBlockedReason();
  if (blocked) return blocked;
  const name = error?.name || "";
  const message = error?.message || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Quyền micro bị từ chối. Cho phép mic cho trình duyệt này trong Cài đặt, rồi tải lại trang.";
  }
  if (name === "SecurityError" || /insecure|security/i.test(message)) {
    return `Lỗi bảo mật: mở cửa sổ trình duyệt thật tại ${pageUrl()}`;
  }
  if (name === "NotFoundError") return "Không tìm thấy micro.";
  if (name === "NotReadableError") return "Micro đang bị app khác dùng. Tắt cuộc gọi/ghi âm khác rồi thử lại.";
  return `Không vào được micro${name ? ` (${name})` : ""}. Cho phép mic rồi thử lại.`;
}

export function createReader(onUpdate) {
  let listening = false;
  let busy = false;
  let stream = null;
  let recognition = null;
  let finals = [];
  let interim = "";
  let audioCtx = null;
  let pcmNodes = null;
  let pcmChunks = [];
  let startedAt = 0;

  function liveTranscript() {
    return [...finals, interim].join(" ").replace(/\s+/g, " ").trim();
  }

  function cleanupMic() {
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
    recognition = null;
    if (pcmNodes) {
      try {
        pcmNodes.processor.onaudioprocess = null;
        pcmNodes.source.disconnect();
        pcmNodes.processor.disconnect();
        pcmNodes.mute.disconnect();
      } catch {
        /* ignore */
      }
    }
    pcmNodes = null;
    if (audioCtx) {
      audioCtx.close().catch(() => {});
    }
    audioCtx = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function startWebSpeech() {
    const Ctor = speechCtor();
    if (!Ctor) return false;
    finals = [];
    interim = "";
    recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0].transcript;
        if (event.results[i].isFinal) finals.push(piece.trim());
        else interim = piece;
      }
      onUpdate({ listening: true, liveText: liveTranscript(), error: "" });
    };
    recognition.onerror = (event) => {
      if (event.error === "aborted" || event.error === "no-speech") return;
      if (event.error === "not-allowed") {
        onUpdate({ error: explainMicError({ name: "NotAllowedError" }), micHelp: true });
      }
    };
    recognition.onend = () => {
      if (!listening || !recognition) return;
      window.setTimeout(() => {
        if (!listening || !recognition) return;
        try {
          recognition.start();
        } catch {
          /* already started */
        }
      }, 400);
    };
    try {
      recognition.start();
      return true;
    } catch {
      recognition = null;
      return false;
    }
  }

  async function startPcmCapture(mediaStream) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    audioCtx = new Ctor();
    if (audioCtx.state === "suspended") await audioCtx.resume();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    const mute = audioCtx.createGain();
    mute.gain.value = 0;
    pcmChunks = [];
    processor.onaudioprocess = (event) => {
      if (!listening) return;
      const data = event.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(data));
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      onUpdate({ listening: true, level: Math.min(1, rms * 10) });
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioCtx.destination);
    pcmNodes = { source, processor, mute };
  }

  async function start(streamPromise) {
    if (listening || busy) {
      if (streamPromise) {
        try {
          (await streamPromise).getTracks().forEach((track) => track.stop());
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (!streamPromise && !navigator.mediaDevices?.getUserMedia) {
      onUpdate({
        listening: false,
        error: explainMicError({ name: "SecurityError" }),
        micHelp: true,
      });
      return;
    }

    listening = true;
    finals = [];
    interim = "";
    pcmChunks = [];
    startedAt = Date.now();
    onUpdate({ listening: true, liveText: "", error: "", message: "Đang bật micro…", level: 0 });

    try {
      stream = await (streamPromise || navigator.mediaDevices.getUserMedia({ audio: true }));
    } catch (error) {
      listening = false;
      onUpdate({
        listening: false,
        error: explainMicError(error),
        micHelp: true,
      });
      return;
    }

    if (!listening) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      return;
    }

    const mobile = isMobile();
    const canSpeech = Boolean(speechCtor());

    // Phones: prefer the native speech API (no WASM). Only record PCM when that API is missing.
    if (mobile && canSpeech) {
      const ok = startWebSpeech();
      onUpdate({
        listening: true,
        liveText: "",
        error: "",
        message: ok
          ? "Đang nghe… chữ hiện bên dưới khi nhận được. Đọc hết câu rồi bấm Dừng."
          : "Không bật được nhận giọng nhanh. Thử lại hoặc dùng Wi‑Fi.",
      });
      if (!ok) {
        void preloadWhisper().catch(() => {});
        await startPcmCapture(stream);
      }
      return;
    }

    if (mobile) void preloadWhisper().catch(() => {});
    await startPcmCapture(stream);
    if (!mobile) startWebSpeech();

    onUpdate({
      listening: true,
      liveText: "",
      error: "",
      message: mobile
        ? "Đang nghe… thanh xanh phải nhấp nháy khi bạn nói. Đọc xong mới bấm Dừng."
        : "Đang nghe… đọc câu màu vàng, rồi bấm Dừng.",
    });
  }

  async function stop(emit = true) {
    listening = false;
    busy = true;
    onUpdate({ listening: false, busy: true, message: "Đang gộp lời nói…", level: 0 });

    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
      await new Promise((resolve) => window.setTimeout(resolve, 500));
    }

    const live = liveTranscript();
    const rate = audioCtx?.sampleRate || 48000;
    const elapsed = Date.now() - startedAt;
    const pcm = concatPcm(pcmChunks);

    cleanupMic();

    if (!emit) {
      busy = false;
      onUpdate({ listening: false, busy: false, level: 0 });
      return;
    }

    const liveOk = live.split(/\s+/).filter(Boolean).length >= 2;
    if (liveOk) {
      busy = false;
      onUpdate({ listening: false, busy: false, liveText: live, finalText: live, message: "", level: 0 });
      return;
    }

    if (!pcm.length) {
      busy = false;
      onUpdate({
        listening: false,
        busy: false,
        level: 0,
        error: live
          ? `Mới nhận được “${live}”. Nói rõ hơn, hết câu, rồi Dừng.`
          : "Chưa nhận được câu. Nói sát mic, đọc hết câu, đợi chữ hiện rồi mới Dừng.",
      });
      return;
    }

    if (elapsed < 800 || pcm.length < rate * 0.5) {
      busy = false;
      onUpdate({
        listening: false,
        busy: false,
        level: 0,
        error: "Ghi quá ngắn. Giữ mic, nói hết câu (2–4 giây), rồi mới Dừng.",
      });
      return;
    }

    onUpdate({
      listening: false,
      busy: true,
      liveText: "",
      level: 0,
      message: isMobile()
        ? "Đang nhận lời nói trên máy… lần đầu có thể mất 30–60 giây."
        : "Đang nhận lời nói…",
    });

    try {
      const text = await transcribePcm(pcm, rate, (message) => {
        onUpdate({ listening: false, busy: true, message });
      });
      busy = false;
      if (text) onUpdate({ listening: false, busy: false, liveText: text, finalText: text, message: "" });
      else {
        onUpdate({
          listening: false,
          busy: false,
          error: "Chưa nhận ra câu. Nói gần mic, chậm hơn một chút, rồi thử lại.",
        });
      }
    } catch (error) {
      busy = false;
      onUpdate({
        listening: false,
        busy: false,
        error: error?.message || "Không nhận được giọng nói. Thử Chrome trên điện thoại và nói gần mic.",
      });
    }
  }

  return { start, stop };
}
