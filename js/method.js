const STOP = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "and",
  "in",
  "on",
  "at",
  "for",
  "is",
  "are",
  "was",
  "were",
  "be",
  "it",
  "i",
  "you",
  "he",
  "she",
  "they",
  "we",
  "do",
  "does",
  "did",
  "not",
  "but",
  "or",
  "as",
  "if",
  "so",
  "with",
]);

export const STAGES = [
  {
    id: "listen",
    label: "1. Nghe",
    hint: "Nghe cả đoạn, mắt đi theo chữ. Đừng cố nhớ máy móc — nắm nhịp và ý.",
  },
  {
    id: "read",
    label: "2. Đọc",
    hint: "Đọc thành tiếng từng câu. App chỉ từ sai. Đây là lúc gắn âm với chữ.",
  },
  {
    id: "recall",
    label: "3. Nhớ",
    hint: "Chỉ còn chữ cái đầu. Nhìn gợi ý, nói nguyên câu. Bấm Lộ chữ nếu kẹt.",
  },
  {
    id: "talk",
    label: "4. Kể",
    hint: "Kể lại như đang nói với bạn. Không cần giống từng chữ — cần đúng ý.",
  },
];

export function firstLetterHint(text) {
  return text.replace(/[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g, (word) => {
    if (word.length <= 3) return word;
    return word[0] + "·".repeat(Math.min(word.length - 1, 8));
  });
}

export function contentTokens(text) {
  return (text.toLowerCase().match(/[a-z0-9]+(?:'[a-z]+)?/g) || []).filter(
    (word) => !STOP.has(word) && word.length > 2
  );
}

export function gradeRetell(expected, spoken) {
  const expectedKeys = [...new Set(contentTokens(expected))];
  const spokenSet = new Set(contentTokens(spoken));
  const hits = expectedKeys.filter((word) => spokenSet.has(word));
  const missing = expectedKeys.filter((word) => !spokenSet.has(word));
  const expectedCount = expectedKeys.length || 1;
  const accuracy = Math.round((hits.length / expectedCount) * 100);
  return {
    kind: "retell",
    hits,
    missing,
    spokenText: spoken.trim(),
    matches: hits.length,
    expectedCount,
    accuracy,
    passed: accuracy >= 50,
  };
}

export function makeTalkItems(sentences) {
  const items = sentences.map((sentence, index) => ({
    q: `Bạn đang nói chuyện với một người bạn. Nói ý câu ${index + 1} bằng tiếng Anh — không cần thuộc lòng.`,
    target: sentence,
  }));
  items.push({
    q: "Kể lại cả đoạn như đang kể cho bạn nghe. Dùng lời của bạn.",
    target: sentences.join(" "),
  });
  return items;
}
