import { preloadWhisper, transcribeAudioBlob } from "./whisper.js";

function speechCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function speechSupported() {
  return Boolean(speechCtor()) || Boolean(navigator.mediaDevices?.getUserMedia);
}

function pickMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/mpeg"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
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
    return "Quyền micro bị từ chối. Trong Chrome: bấm icon mic trên thanh địa chỉ → Allow. Trên Mac: System Settings → Privacy & Security → Microphone → bật cho Google Chrome.";
  }
  if (name === "SecurityError" || /insecure|security/i.test(message)) {
    return `Lỗi bảo mật: mở cửa sổ Chrome thật (không phải preview Cursor) tại ${pageUrl()}`;
  }
  if (name === "NotFoundError") return "Không tìm thấy micro.";
  if (name === "NotReadableError") return "Micro đang bị Zoom/Meet hoặc app khác dùng. Tắt app đó rồi thử lại.";
  return `Không vào được micro${name ? ` (${name})` : ""}. Mở Chrome tại ${pageUrl()} rồi Allow micro.`;
}

export function createReader(onUpdate) {
  let listening = false;
  let busy = false;
  let stream = null;
  let recorder = null;
  let chunks = [];
  let recognition = null;
  let finals = [];
  let interim = "";
  let stopResolver = null;

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
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    recorder = null;
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function startWebSpeech() {
    const Ctor = speechCtor();
    if (!Ctor) return;
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
        onUpdate({ error: "Chưa cấp quyền micro. Cho phép mic cho trang này rồi bấm lại." });
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
      }, 250);
    };
    try {
      recognition.start();
    } catch {
      recognition = null;
    }
  }

  async function start(streamPromise) {
    if (listening || busy) {
      if (streamPromise) {
        try {
          const extra = await streamPromise;
          extra.getTracks().forEach((track) => track.stop());
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
      });
      return;
    }

    listening = true;
    chunks = [];
    finals = [];
    interim = "";
    onUpdate({ listening: true, liveText: "", error: "", message: "Đang bật micro…" });

    try {
      stream = await (streamPromise ||
        navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        }));
    } catch (error) {
      listening = false;
      onUpdate({
        listening: false,
        error: explainMicError(error),
      });
      return;
    }

    if (!listening) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
      return;
    }

    void preloadWhisper().catch(() => {});

    if (window.MediaRecorder) {
      const mime = pickMime();
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onstop = () => {
        if (stopResolver) {
          stopResolver();
          stopResolver = null;
        }
      };
      recorder.start(200);
    }

    const safari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (!safari) startWebSpeech();
    onUpdate({
      listening: true,
      liveText: "",
      error: "",
      message: "Đang nghe… đọc câu màu vàng, rồi bấm Dừng.",
    });
  }

  async function stop(emit = true) {
    listening = false;
    busy = true;
    onUpdate({ listening: false, busy: true, message: "Đang nhận lời nói…" });

    const live = liveTranscript();
    if (recognition) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }

    if (!recorder) {
      cleanupMic();
      busy = false;
      if (emit && live) onUpdate({ listening: false, busy: false, liveText: live, finalText: live, message: "" });
      else if (emit) onUpdate({ listening: false, busy: false, error: "Micro chưa kịp bật. Bấm lại Bắt đầu đọc." });
      else onUpdate({ listening: false, busy: false });
      return;
    }

    const mimeType = recorder.mimeType || chunks[0]?.type || "audio/webm";
    const stopped = new Promise((resolve) => {
      stopResolver = resolve;
      window.setTimeout(resolve, 800);
    });
    if (recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        stopResolver?.();
      }
    } else {
      stopResolver?.();
    }
    await stopped;

    const blob = new Blob(chunks, { type: mimeType });
    cleanupMic();

    if (!emit) {
      busy = false;
      onUpdate({ listening: false, busy: false });
      return;
    }

    if (live) {
      busy = false;
      onUpdate({ listening: false, busy: false, liveText: live, finalText: live, message: "" });
      return;
    }

    onUpdate({
      listening: false,
      busy: true,
      liveText: "",
      message: "Đang nhận lời nói… lần đầu có thể mất chút thời gian.",
    });

    try {
      const text = await transcribeAudioBlob(blob, (message) => {
        onUpdate({ listening: false, busy: true, message });
      });
      busy = false;
      if (text) onUpdate({ listening: false, busy: false, liveText: text, finalText: text, message: "" });
      else {
        onUpdate({
          listening: false,
          busy: false,
          error: "Chưa nhận được lời nói. Giữ nút Dừng sau khi đọc xong câu.",
        });
      }
    } catch (error) {
      busy = false;
      onUpdate({
        listening: false,
        busy: false,
        error: error?.message || "Không nhận được giọng nói. Thử lại trên Chrome và cho phép micro.",
      });
    }
  }

  return { start, stop };
}
