const WORD_RE = /[A-Za-z0-9]+(?:['’][A-Za-z]+)?/g;

export function normalizeWord(word) {
  return word.toLowerCase().replace(/’/g, "'");
}

export function tokenize(text) {
  return (text.match(WORD_RE) || []).map(normalizeWord);
}

export function tokenizeWithSpans(text) {
  const tokens = [];
  const re = new RegExp(WORD_RE.source, "g");
  let match;
  while ((match = re.exec(text))) {
    tokens.push({
      raw: match[0],
      norm: normalizeWord(match[0]),
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return tokens;
}

function alignWords(expected, spoken) {
  const n = expected.length;
  const m = spoken.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  const bt = Array.from({ length: n + 1 }, () => Array(m + 1).fill(""));

  for (let i = 1; i <= n; i += 1) {
    dp[i][0] = i;
    bt[i][0] = "del";
  }
  for (let j = 1; j <= m; j += 1) {
    dp[0][j] = j;
    bt[0][j] = "ins";
  }

  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = expected[i - 1] === spoken[j - 1] ? 0 : 1;
      const options = [
        { v: dp[i - 1][j - 1] + cost, op: cost === 0 ? "match" : "sub" },
        { v: dp[i - 1][j] + 1, op: "del" },
        { v: dp[i][j - 1] + 1, op: "ins" },
      ];
      options.sort((a, b) => a.v - b.v);
      dp[i][j] = options[0].v;
      bt[i][j] = options[0].op;
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const op = bt[i][j] || (i > 0 ? "del" : "ins");
    if (op === "match" || op === "sub") {
      ops.push({
        type: op,
        expected: expected[i - 1],
        spoken: spoken[j - 1],
        expectedIndex: i - 1,
      });
      i -= 1;
      j -= 1;
    } else if (op === "del") {
      ops.push({
        type: "miss",
        expected: expected[i - 1],
        spoken: "",
        expectedIndex: i - 1,
      });
      i -= 1;
    } else {
      ops.push({
        type: "extra",
        expected: "",
        spoken: spoken[j - 1],
        expectedIndex: -1,
      });
      j -= 1;
    }
  }

  return ops.reverse();
}

export function gradeSentence(expectedText, spokenText) {
  const expectedTokens = tokenizeWithSpans(expectedText);
  const spoken = tokenize(spokenText);
  const expected = expectedTokens.map((token) => token.norm);
  const ops = alignWords(expected, spoken);
  const expectedCount = expected.length || 1;
  const matches = ops.filter((op) => op.type === "match").length;
  const accuracy = Math.round((matches / expectedCount) * 100);

  return {
    ops,
    expectedTokens,
    spokenText: spokenText.trim(),
    matches,
    expectedCount,
    accuracy,
    passed: accuracy >= 80,
  };
}

export function renderSentenceHtml(sentence, grade) {
  if (!grade) {
    return escapeHtml(sentence);
  }

  const byIndex = new Map();
  for (const op of grade.ops) {
    if (op.expectedIndex >= 0 && !byIndex.has(op.expectedIndex)) {
      byIndex.set(op.expectedIndex, op);
    }
  }

  let html = "";
  let cursor = 0;
  grade.expectedTokens.forEach((token, index) => {
    html += escapeHtml(sentence.slice(cursor, token.start));
    const op = byIndex.get(index);
    const kind = !op || op.type === "match" ? "ok" : op.type === "sub" ? "bad" : "miss";
    const spoken = op && op.spoken ? op.spoken : "";
    html += `<span class="word ${kind}" data-word="${escapeAttr(token.raw)}" data-spoken="${escapeAttr(spoken)}" title="${titleFor(kind, token.raw, spoken)}">${escapeHtml(token.raw)}</span>`;
    cursor = token.end;
  });
  html += escapeHtml(sentence.slice(cursor));
  return html;
}

function titleFor(kind, expected, spoken) {
  if (kind === "ok") return expected;
  if (kind === "bad") return `Bạn nói “${spoken}” — đúng là “${expected}”`;
  return `Thiếu từ “${expected}”`;
}

export function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function escapeAttr(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
