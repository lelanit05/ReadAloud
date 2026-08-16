function pickVoice() {
  const voices = window.speechSynthesis?.getVoices?.() || [];
  return (
    voices.find((voice) => voice.lang === "en-US" && /Google|Samantha|Aria|Jenny/i.test(voice.name)) ||
    voices.find((voice) => voice.lang.startsWith("en-US")) ||
    voices.find((voice) => voice.lang.startsWith("en")) ||
    null
  );
}

let speakToken = 0;

export function stopSpeak() {
  speakToken += 1;
  window.speechSynthesis?.cancel();
}

export function speak(text, { rate = 0.92, onend } = {}) {
  if (!window.speechSynthesis || !text) {
    onend?.();
    return;
  }
  stopSpeak();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "en-US";
  utterance.rate = rate;
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  if (onend) utterance.onend = onend;
  window.speechSynthesis.speak(utterance);
}

export function speakMany(texts, { rate = 0.92, onIndex, onDone } = {}) {
  stopSpeak();
  const token = speakToken;
  let index = 0;
  const play = () => {
    if (token !== speakToken) return;
    if (index >= texts.length) {
      onDone?.();
      return;
    }
    onIndex?.(index);
    const utterance = new SpeechSynthesisUtterance(texts[index]);
    utterance.lang = "en-US";
    utterance.rate = rate;
    const voice = pickVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = () => {
      if (token !== speakToken) return;
      index += 1;
      window.setTimeout(play, 280);
    };
    window.speechSynthesis.speak(utterance);
  };
  play();
}

export function warmupVoices() {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", () => {
    window.speechSynthesis.getVoices();
  });
}
