import { PASSAGES, splitSentences } from "./passages.js";
import { escapeAttr, escapeHtml, gradeSentence, renderSentenceHtml } from "./align.js";
import { firstLetterHint, gradeRetell, makeTalkItems, STAGES } from "./method.js";
import { createReader, explainMicError, micBlockedReason, speechSupported } from "./speech.js";
import { speak, speakMany, stopSpeak, warmupVoices } from "./tts.js";

const els = {
  select: document.querySelector("#passage-select"),
  pasteToggle: document.querySelector("#paste-toggle"),
  customBox: document.querySelector("#custom-box"),
  customText: document.querySelector("#custom-text"),
  useCustom: document.querySelector("#use-custom"),
  stageNav: document.querySelector("#stage-nav"),
  passageTitle: document.querySelector("#passage-title"),
  progress: document.querySelector("#progress-label"),
  passageBody: document.querySelector("#passage-body"),
  stageKicker: document.querySelector("#stage-kicker"),
  stageHint: document.querySelector("#stage-hint"),
  promptText: document.querySelector("#prompt-text"),
  current: document.querySelector("#current-sentence"),
  wordResult: document.querySelector("#word-result"),
  spokenLine: document.querySelector("#spoken-line"),
  scoreLine: document.querySelector("#score-line"),
  listenBtn: document.querySelector("#listen-btn"),
  listenAllBtn: document.querySelector("#listen-all-btn"),
  peekBtn: document.querySelector("#peek-btn"),
  micBtn: document.querySelector("#mic-btn"),
  micLabel: document.querySelector("#mic-label"),
  retryBtn: document.querySelector("#retry-btn"),
  nextBtn: document.querySelector("#next-btn"),
  advanceBtn: document.querySelector("#advance-btn"),
  liveText: document.querySelector("#live-text"),
  status: document.querySelector("#status"),
  doneCard: document.querySelector("#done-card"),
  doneSummary: document.querySelector("#done-summary"),
  restartBtn: document.querySelector("#restart-btn"),
  browserNote: document.querySelector("#browser-note"),
  practiceCard: document.querySelector(".practice-card"),
  micHelp: document.querySelector("#mic-help"),
  micHelpText: document.querySelector("#mic-help-text"),
  copyUrl: document.querySelector("#copy-url"),
};

const state = {
  title: PASSAGES[0].title,
  sentences: splitSentences(PASSAGES[0].text),
  index: 0,
  grades: [],
  talkGrades: [],
  talkIndex: 0,
  stage: "listen",
  peeking: false,
  listening: false,
};
state.grades = state.sentences.map(() => null);

function talkItems() {
  return makeTalkItems(state.sentences);
}

function stageMeta() {
  return STAGES.find((item) => item.id === state.stage) || STAGES[0];
}

function currentSentence() {
  return state.sentences[state.index] || "";
}

function currentTalk() {
  return talkItems()[state.talkIndex];
}

const reader = createReader((update) => {
  if (update.error) {
    els.status.textContent = update.error;
    els.status.className = "status is-error";
    showMicHelp(update.error);
  } else if (update.message) {
    els.status.textContent = update.message;
    els.status.className = "status is-listening";
  }
  if (typeof update.liveText === "string") els.liveText.textContent = update.liveText;
  if (typeof update.listening === "boolean") setListening(update.listening);
  if (typeof update.busy === "boolean") {
    els.micBtn.disabled = update.busy;
    if (update.busy) els.micLabel.textContent = "Đang xử lý…";
  }
  if (update.listening === false && update.finalText != null) {
    if (update.finalText) applyGrade(update.finalText);
    else if (!update.error) {
      els.status.textContent = "Chưa nhận được lời nói. Bấm mic và nói lại.";
      els.status.className = "status is-error";
    }
  }
});

function setListening(on) {
  state.listening = on;
  els.micBtn.setAttribute("aria-pressed", String(on));
  els.micLabel.textContent = on ? "Dừng" : micLabel();
  els.listenBtn.disabled = on;
  els.listenAllBtn.disabled = on;
}

function micLabel() {
  if (state.stage === "talk") return "Bắt đầu kể";
  if (state.stage === "recall") return "Nói từ trí nhớ";
  return "Bắt đầu đọc";
}

function loadPassage(title, text) {
  if (state.listening) reader.stop(false);
  stopSpeak();
  state.title = title;
  state.sentences = splitSentences(text);
  state.index = 0;
  state.talkIndex = 0;
  state.grades = state.sentences.map(() => null);
  state.talkGrades = talkItems().map(() => null);
  state.stage = "listen";
  state.peeking = false;
  els.doneCard.hidden = true;
  els.practiceCard.hidden = false;
  els.customBox.hidden = true;
  render();
}

function setStage(id) {
  if (state.listening) reader.stop(false);
  stopSpeak();
  state.stage = id;
  state.peeking = false;
  if (id !== "talk") els.doneCard.hidden = true;
  render();
}

function renderStages() {
  els.stageNav.innerHTML = STAGES.map(
    (item) =>
      `<button type="button" class="stage${item.id === state.stage ? " is-on" : ""}" data-stage="${item.id}">${item.label}</button>`
  ).join("");
}

function render() {
  const meta = stageMeta();
  const talkDone = state.stage === "talk" && state.talkIndex >= talkItems().length;
  const sentenceDone = state.stage !== "talk" && state.stage !== "listen" && state.index >= state.sentences.length;

  renderStages();
  els.passageTitle.textContent = `${state.title} · ${state.sentences.length} câu`;
  els.stageKicker.textContent = meta.label;
  els.stageHint.textContent = meta.hint;
  els.passageBody.classList.toggle("is-blur", state.stage === "talk" || state.stage === "recall");

  if (state.stage === "talk") {
    els.progress.textContent = talkDone
      ? "Xong kể lại"
      : `Ý ${state.talkIndex + 1}/${talkItems().length}`;
  } else {
    els.progress.textContent =
      state.index >= state.sentences.length
        ? "Hết câu"
        : `Câu ${Math.min(state.index + 1, state.sentences.length)}/${state.sentences.length}`;
  }

  els.passageBody.innerHTML = state.sentences
    .map((sentence, i) => {
      const current = state.stage === "talk" ? false : i === state.index;
      const cls = current ? "is-current" : state.grades[i] ? "is-done" : "";
      const html =
        state.stage === "recall" && !state.peeking && current
          ? escapeHtml(firstLetterHint(sentence))
          : renderSentenceHtml(sentence, state.grades[i]);
      return `<span class="sent ${cls}" data-index="${i}">${html}</span> `;
    })
    .join("");

  if (talkDone || (sentenceDone && state.stage === "read")) {
    if (state.stage === "read") {
      els.practiceCard.hidden = false;
      els.doneCard.hidden = true;
      showAdvanceOnly("Đã đọc xong. Sang bước Nhớ — che chữ, nói từ trí nhớ.");
      return;
    }
    els.practiceCard.hidden = true;
    els.doneCard.hidden = false;
    const scores = state.talkGrades.filter(Boolean).map((g) => g.accuracy);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    els.doneSummary.textContent = `Bạn đã kể lại với khoảng ${avg}% ý chính. Luyện lại từ Nghe nếu còn vướng.`;
    return;
  }

  if (sentenceDone && state.stage === "recall") {
    els.practiceCard.hidden = false;
    els.doneCard.hidden = true;
    showAdvanceOnly("Nhớ được câu rồi. Sang bước Kể — nói như đang hội thoại.");
    return;
  }

  els.practiceCard.hidden = false;
  els.doneCard.hidden = true;
  els.advanceBtn.hidden = false;
  renderPractice();
}

function showAdvanceOnly(message) {
  els.promptText.hidden = true;
  els.current.innerHTML = "";
  els.wordResult.hidden = true;
  els.spokenLine.hidden = true;
  els.scoreLine.hidden = true;
  els.retryBtn.hidden = true;
  els.nextBtn.hidden = true;
  els.peekBtn.hidden = true;
  els.micBtn.hidden = true;
  els.listenBtn.hidden = true;
  els.listenAllBtn.hidden = true;
  els.advanceBtn.hidden = false;
  els.advanceBtn.textContent = nextStageLabel();
  els.status.textContent = message;
  els.status.className = "status";
}

function nextStageLabel() {
  if (state.stage === "listen") return "Sang bước Đọc";
  if (state.stage === "read") return "Sang bước Nhớ";
  if (state.stage === "recall") return "Sang bước Kể";
  return "Xong";
}

function renderPractice() {
  const listen = state.stage === "listen";
  const recall = state.stage === "recall";
  const talk = state.stage === "talk";
  const grade = talk ? state.talkGrades[state.talkIndex] : state.grades[state.index];

  els.listenBtn.hidden = false;
  els.listenAllBtn.hidden = !listen;
  els.peekBtn.hidden = !recall;
  els.micBtn.hidden = listen;
  els.micLabel.textContent = state.listening ? "Dừng" : micLabel();
  els.advanceBtn.textContent = nextStageLabel();
  els.advanceBtn.hidden = !listen;

  if (talk) {
    const item = currentTalk();
    els.promptText.hidden = false;
    els.promptText.textContent = item.q;
    els.current.innerHTML = "";
    els.listenBtn.textContent = "Nghe ý mẫu";
  } else {
    els.promptText.hidden = true;
    els.listenBtn.textContent = "Nghe câu này";
    if (recall && !state.peeking) {
      els.current.innerHTML = `<span class="hint-sent">${escapeHtml(firstLetterHint(currentSentence()))}</span>`;
    } else {
      els.current.innerHTML = renderSentenceHtml(currentSentence(), state.grades[state.index]);
    }
  }

  renderGradePanel(grade, talk);
}

function renderGradePanel(grade, talk) {
  const hasGrade = Boolean(grade);
  els.wordResult.hidden = !hasGrade;
  els.spokenLine.hidden = !hasGrade;
  els.scoreLine.hidden = !hasGrade;
  els.retryBtn.hidden = !hasGrade;
  els.nextBtn.hidden = !hasGrade || state.stage === "listen";

  if (!hasGrade) {
    els.wordResult.innerHTML = "";
    els.spokenLine.textContent = "";
    els.scoreLine.textContent = "";
    if (state.stage === "listen") {
      els.status.textContent = "Bấm Nghe cả đoạn, mắt đi theo câu vàng. Xong thì Sang bước Đọc.";
    } else if (talk) {
      els.status.textContent = "Nói ý, đừng đọc thuộc. App chỉ cần bạn giữ được từ chính.";
    } else if (state.stage === "recall") {
      els.status.textContent = "Nói nguyên câu từ gợi ý. Kẹt thì Lộ chữ 2 giây.";
    } else {
      els.status.textContent = speechSupported()
        ? "Bấm mic, đọc câu đang tô vàng, rồi bấm Dừng."
        : "Trình duyệt này không nhận giọng nói. Hãy dùng Chrome.";
    }
    return;
  }

  if (grade.kind === "retell") {
    els.wordResult.innerHTML = [
      ...grade.hits.map(
        (word) =>
          `<button type="button" class="chip ok" data-word="${escapeAttr(word)}">${escapeHtml(word)}</button>`
      ),
      ...grade.missing.map(
        (word) =>
          `<button type="button" class="chip miss" data-word="${escapeAttr(word)}">${escapeHtml(word)}</button>`
      ),
    ].join("");
    els.spokenLine.textContent = `Bạn nói: ${grade.spokenText || "—"}`;
    els.scoreLine.textContent = `Giữ được ${grade.matches}/${grade.expectedCount} ý chính (${grade.accuracy}%). ${
      grade.passed ? "Đủ để sang ý tiếp." : "Thiếu từ vàng — bấm để nghe, rồi kể lại."
    }`;
    els.nextBtn.textContent = grade.passed ? "Ý tiếp" : "Bỏ qua";
    els.status.textContent = "Từ xanh là bạn đã nói; từ vàng là ý còn thiếu.";
    return;
  }

  const extras = grade.ops.filter((op) => op.type === "extra");
  els.wordResult.innerHTML = grade.ops
    .filter((op) => op.type !== "extra")
    .map((op) => {
      const label =
        op.type === "sub" ? `${op.expected} → ${op.spoken}` : op.type === "miss" ? `${op.expected} (thiếu)` : op.expected;
      return `<button type="button" class="chip ${op.type === "match" ? "ok" : op.type === "sub" ? "bad" : "miss"}" data-word="${escapeAttr(op.expected)}">${escapeHtml(label)}</button>`;
    })
    .concat(
      extras.map(
        (op) =>
          `<button type="button" class="chip extra" data-word="${escapeAttr(op.spoken)}">thêm: ${escapeHtml(op.spoken)}</button>`
      )
    )
    .join("");

  els.spokenLine.textContent = `Bạn nói: ${grade.spokenText || "—"}`;
  els.scoreLine.textContent = `Đúng ${grade.matches}/${grade.expectedCount} từ (${grade.accuracy}%). ${
    grade.passed ? "Đủ để sang câu tiếp." : "Đọc lại cho sát hơn, hoặc bỏ qua."
  }`;
  els.nextBtn.textContent = grade.passed ? "Câu tiếp" : "Bỏ qua";
  els.status.textContent = "Bấm từ đỏ/vàng để nghe cách đọc đúng.";
}

function applyGrade(spoken) {
  if (state.stage === "talk") {
    const item = currentTalk();
    if (!item) return;
    state.talkGrades[state.talkIndex] = gradeRetell(item.target, spoken);
  } else {
    state.grades[state.index] = gradeSentence(currentSentence(), spoken);
  }
  render();
}

function goNext() {
  els.liveText.textContent = "";
  if (state.stage === "talk") state.talkIndex += 1;
  else if (state.index < state.sentences.length) state.index += 1;
  render();
}

function advanceStage() {
  if (state.stage === "listen") setStage("read");
  else if (state.stage === "read") {
    state.index = 0;
    setStage("recall");
  } else if (state.stage === "recall") {
    state.talkIndex = 0;
    state.talkGrades = talkItems().map(() => null);
    setStage("talk");
  }
}

els.stageNav.addEventListener("click", (event) => {
  const btn = event.target.closest("[data-stage]");
  if (!btn) return;
  if (btn.dataset.stage === "talk") {
    state.talkIndex = 0;
    if (!state.talkGrades.length) state.talkGrades = talkItems().map(() => null);
  }
  setStage(btn.dataset.stage);
});

els.select.innerHTML = PASSAGES.map(
  (p) => `<option value="${p.id}">${p.title} (${p.level})</option>`
).join("");

els.select.addEventListener("change", () => {
  const passage = PASSAGES.find((p) => p.id === els.select.value);
  loadPassage(passage.title, passage.text);
});

els.pasteToggle.addEventListener("click", () => {
  els.customBox.hidden = !els.customBox.hidden;
});

els.useCustom.addEventListener("click", () => {
  const text = els.customText.value.trim();
  if (!text) return;
  loadPassage("Đoạn của bạn", text);
});

els.listenBtn.addEventListener("click", () => {
  stopSpeak();
  const text = state.stage === "talk" ? currentTalk()?.target : currentSentence();
  speak(text);
});

els.listenAllBtn.addEventListener("click", () => {
  speakMany(state.sentences, {
    onIndex(index) {
      state.index = index;
      render();
    },
  });
});

els.peekBtn.addEventListener("click", () => {
  state.peeking = true;
  render();
  window.setTimeout(() => {
    state.peeking = false;
    render();
  }, 2000);
});

els.advanceBtn.addEventListener("click", advanceStage);

function showMicHelp(text) {
  if (!els.micHelp) return;
  els.micHelp.hidden = false;
  els.micHelpText.textContent = text;
}

els.micBtn.addEventListener("click", () => {
  if (state.listening) {
    els.status.textContent = "Đang dừng và nhận lời nói…";
    els.status.className = "status is-listening";
    void reader.stop(true);
    return;
  }

  const blocked = micBlockedReason();
  if (blocked) {
    els.status.textContent = blocked;
    els.status.className = "status is-error";
    showMicHelp(blocked);
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    const text = explainMicError({ name: "SecurityError" });
    els.status.textContent = text;
    els.status.className = "status is-error";
    showMicHelp(text);
    return;
  }

  stopSpeak();
  els.liveText.textContent = "";
  els.status.textContent = "Đang bật micro…";
  els.status.className = "status is-listening";
  const pending = navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  void reader.start(pending);
});

els.retryBtn.addEventListener("click", () => {
  if (state.stage === "talk") state.talkGrades[state.talkIndex] = null;
  else state.grades[state.index] = null;
  els.liveText.textContent = "";
  render();
});

els.nextBtn.addEventListener("click", goNext);
els.restartBtn.addEventListener("click", () => {
  state.index = 0;
  state.talkIndex = 0;
  state.grades = state.sentences.map(() => null);
  state.talkGrades = talkItems().map(() => null);
  state.stage = "listen";
  els.doneCard.hidden = true;
  render();
});

els.passageBody.addEventListener("click", (event) => {
  if (event.target.closest("[data-word]")) return;
  const sent = event.target.closest(".sent");
  if (!sent || state.listening) return;
  const index = Number(sent.dataset.index);
  if (Number.isNaN(index)) return;
  state.index = index;
  els.liveText.textContent = "";
  render();
});

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-word]");
  if (!target) return;
  speak(target.getAttribute("data-word"));
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.target.matches("textarea, select, input")) return;
  event.preventDefault();
  if (state.stage === "listen") els.listenBtn.click();
  else els.micBtn.click();
});

if (!speechSupported()) {
  els.browserNote.hidden = false;
}

els.copyUrl?.addEventListener("click", async () => {
  const url = window.location.href;
  try {
    await navigator.clipboard.writeText(url);
    els.copyUrl.textContent = "Đã copy";
  } catch {
    window.prompt("Copy địa chỉ này:", url);
  }
});

const blockedAtLoad = micBlockedReason();
if (blockedAtLoad) showMicHelp(blockedAtLoad);

warmupVoices();
render();
