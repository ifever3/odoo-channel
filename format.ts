export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatInlineMarkdown(text: string): string {
  let s = escapeHtml(text);
  s = s.replace(/`([^`]+)`/g, '<code style="background:#eef2ff;color:#3730a3;padding:2px 6px;border-radius:6px;font-family:Consolas,monospace;font-size:12px;">$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<strong>$1</strong>");
  s = s.replace(/\*(?!\s)([^*]+?)\*/g, "<em>$1</em>");
  return s;
}

function getNoticeStyle(text: string): string | null {
  if (/^(✅|🎉|🟢|成功|已完成|已创建|已确认)/.test(text)) return "background:#ecfdf3;border-left:4px solid #16a34a;";
  if (/^(⚠️|⚠|提醒|注意|警告)/.test(text)) return "background:#fffbeb;border-left:4px solid #d97706;";
  if (/^(❌|错误|失败|异常|报错)/.test(text)) return "background:#fef2f2;border-left:4px solid #dc2626;";
  if (/^(ℹ️|提示|说明|信息)/.test(text)) return "background:#eff6ff;border-left:4px solid #2563eb;";
  return null;
}

function guessEmojiTitle(text: string): { emoji: string; title: string } | null {
  const first = text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || "";
  if (!first) return null;
  if (/(失败|错误|异常|报错|error)/i.test(first)) return { emoji: "❌", title: first.replace(/^(❌|错误[:：]?|失败[:：]?)/, "").trim() || "处理失败" };
  if (/(提醒|注意|警告|warning)/i.test(first)) return { emoji: "⚠️", title: first.replace(/^(⚠️|⚠|提醒[:：]?|注意[:：]?)/, "").trim() || "请注意" };
  if (/(采购单|purchase|rfq|po)/i.test(text)) return { emoji: "📦", title: first };
  if (/(销售单|sale order|\bso\b)/i.test(text)) return { emoji: "🧾", title: first };
  if (/(发票|invoice|bill)/i.test(text)) return { emoji: "💰", title: first };
  if (/(客户|联系人|partner|supplier|vendor)/i.test(text)) return { emoji: "👤", title: first };
  if (/(成功|已创建|已确认|已完成|完成了)/i.test(first)) return { emoji: "✅", title: first };
  if (/(查询|结果|找到|列表|list|search|show)/i.test(first)) return { emoji: "🔎", title: first };
  return { emoji: "✨", title: first };
}

function parseKeyValueLine(line: string): { key: string; value: string } | null {
  const m = line.match(/^\s*(?:[-*•]\s*)?(?:\*\*)?([^:：]{1,24}?)(?:\*\*)?\s*[:：]\s*(.+)\s*$/);
  if (!m) return null;
  const key = m[1].trim();
  const value = m[2].trim();
  if (!key || !value) return null;
  if (/^(http|https):\/\//i.test(key)) return null;
  return { key, value };
}

function looksLikeDivider(line: string): boolean {
  return /^[-=]{3,}$/.test(line.trim());
}

function parseListHeader(line: string): string | null {
  const trimmed = line.trim();
  const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
  if (numbered) return numbered[1].trim();
  const bulleted = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulleted) return bulleted[1].trim();
  return null;
}

function tryBuildRecordTable(src: string[], startIndex: number): { lines: string[]; nextIndex: number } | null {
  const records: Array<{ title: string; fields: Record<string, string> }> = [];
  let i = startIndex;
  while (i < src.length) {
    while (i < src.length && !src[i].trim()) i += 1;
    if (i >= src.length) break;
    const header = parseListHeader(src[i]);
    if (!header) break;
    i += 1;
    const fields: Record<string, string> = {};
    while (i < src.length) {
      const line = src[i].trim();
      if (!line) { i += 1; continue; }
      if (parseListHeader(line)) break;
      const kv = parseKeyValueLine(line);
      if (!kv) break;
      fields[kv.key] = kv.value;
      i += 1;
    }
    if (Object.keys(fields).length < 2) break;
    records.push({ title: header, fields });
  }
  if (records.length < 2) return null;
  const keyOrder: string[] = [];
  for (const record of records) {
    for (const key of Object.keys(record.fields)) {
      if (!keyOrder.includes(key)) keyOrder.push(key);
    }
  }
  const usefulKeys = keyOrder.filter((key) => records.filter((r) => r.fields[key]).length >= 2).slice(0, 5);
  if (usefulKeys.length < 2) return null;
  const tableLines = [
    `| 项目 | ${usefulKeys.join(" | ")} |`,
    `| ${["---", ...usefulKeys.map(() => "---")].join(" | ")} |`,
    ...records.map((record) => `| ${record.title} | ${usefulKeys.map((key) => record.fields[key] || "-").join(" | ")} |`),
    "",
  ];
  return { lines: tableLines, nextIndex: i };
}

export function isMarkdownTable(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) return false;
  const header = lines[index]?.trim() || "";
  const sep = lines[index + 1]?.trim() || "";
  return /^\|.+\|$/.test(header) && /^\|?[\s:-]+(?:\|[\s:-]+)+\|?$/.test(sep);
}

function parseTableRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

function markdownTableToHtml(lines: string[], index: number): { html: string; nextIndex: number } {
  const headerCells = parseTableRow(lines[index]);
  let i = index + 2;
  const bodyRows: string[][] = [];
  while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
    bodyRows.push(parseTableRow(lines[i]));
    i += 1;
  }
  const th = (c: string) => `<th style="padding:10px 12px;border:1px solid #e5e7eb;background:#f8fafc;text-align:left;font-weight:700;white-space:nowrap;">${formatInlineMarkdown(c)}</th>`;
  const td = (c: string) => `<td style="padding:9px 12px;border:1px solid #e5e7eb;vertical-align:top;">${formatInlineMarkdown(c)}</td>`;
  const thead = `<tr>${headerCells.map(th).join("")}</tr>`;
  const tbody = bodyRows.map((row, idx) => `<tr style="background:${idx % 2 === 0 ? "#ffffff" : "#fbfdff"}">${row.map(td).join("")}</tr>`).join("");
  return {
    html: `<div style="margin:12px 0 16px 0;overflow-x:auto;border:1px solid #e5e7eb;border-radius:12px;"><table style="border-collapse:collapse;width:100%;font-size:13px;background:#fff;"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`,
    nextIndex: i,
  };
}

export function preprocessForOdooRichText(text: string): string {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return normalized;
  const src = normalized.split("\n");
  const out: string[] = [];
  let i = 0;
  let injectedTitle = false;
  const titleGuess = guessEmojiTitle(normalized);
  if (titleGuess) { out.push(`## ${titleGuess.emoji} ${titleGuess.title}`); injectedTitle = true; }
  while (i < src.length) {
    const raw = src[i] ?? "";
    const line = raw.trim();
    if (!line) { out.push(""); i += 1; continue; }
    if (looksLikeDivider(line)) { i += 1; continue; }
    if (injectedTitle && i === 0 && titleGuess && line === titleGuess.title) { i += 1; continue; }
    if (isMarkdownTable(src, i)) {
      out.push(src[i], src[i + 1]);
      i += 2;
      while (i < src.length && /^\|.+\|$/.test(src[i].trim())) { out.push(src[i]); i += 1; }
      out.push("");
      continue;
    }
    const recordTable = tryBuildRecordTable(src, i);
    if (recordTable) { out.push(...recordTable.lines); i = recordTable.nextIndex; continue; }
    const kvRows: Array<{ key: string; value: string }> = [];
    let j = i;
    while (j < src.length) { const p = parseKeyValueLine(src[j]); if (!p) break; kvRows.push(p); j += 1; }
    if (kvRows.length >= 2) {
      out.push("| 字段 | 内容 |", "| --- | --- |");
      for (const row of kvRows) out.push(`| ${row.key} | ${row.value} |`);
      out.push(""); i = j; continue;
    }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    if (numbered) { out.push(`${numbered[1]}. ${numbered[2]}`); i += 1; continue; }
    if (/^[-*]\s+/.test(line)) {
      const body = line.replace(/^[-*]\s+/, "");
      out.push(/^(✅|📌|👉|🔹|▫️|•)/.test(body) ? `- ${body}` : `- 👉 ${body}`);
      i += 1; continue;
    }
    if (/^(接下来|你还可以|下一步|可继续|可执行)/.test(line)) { out.push(`### 👉 ${line}`); i += 1; continue; }
    out.push(line); i += 1;
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function formatOdooRichText(text: string): string {
  const normalized = preprocessForOdooRichText(text);
  if (!normalized) return "<div> </div>";
  const lines = normalized.split("\n");
  const parts: string[] = ['<div class="openclaw-rich" style="line-height:1.65;font-size:14px;color:#0f172a;">' ];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i] ?? "";
    const line = raw.trim();
    if (!line) { i += 1; continue; }
    if (isMarkdownTable(lines, i)) {
      const table = markdownTableToHtml(lines, i);
      parts.push(table.html); i = table.nextIndex; continue;
    }
    const h3 = line.match(/^###\s+(.+)$/);
    const h2 = line.match(/^##\s+(.+)$/);
    const h1 = line.match(/^#\s+(.+)$/);
    if (h3 || h2 || h1) {
      const textValue = h3?.[1] || h2?.[1] || h1?.[1] || line;
      const size = h1 ? 20 : h2 ? 18 : 16;
      parts.push(`<div style="margin:14px 0 10px 0;padding:0 0 6px 0;font-weight:800;font-size:${size}px;border-bottom:1px solid #e5e7eb;letter-spacing:.1px;">${formatInlineMarkdown(textValue)}</div>`);
      i += 1; continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i += 1; }
      parts.push(`<ul style="margin:8px 0 8px 18px;padding:0;">${items.map((item) => `<li style="margin:4px 0;">${formatInlineMarkdown(item)}</li>`).join("")}</ul>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+\.\s+/, "")); i += 1; }
      parts.push(`<ol style="margin:8px 0 8px 18px;padding:0;">${items.map((item) => `<li style="margin:4px 0;">${formatInlineMarkdown(item)}</li>`).join("")}</ol>`);
      continue;
    }
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { codeLines.push(lines[i]); i += 1; }
      i += 1;
      parts.push(`<pre style="background:#1e1e2e;color:#cdd6f4;padding:14px 16px;border-radius:10px;overflow-x:auto;font-size:12px;font-family:Consolas,monospace;margin:12px 0;">${escapeHtml(codeLines.join("\n"))}</pre>`);
      continue;
    }
    const noticeStyle = getNoticeStyle(line);
    if (noticeStyle) {
      parts.push(`<div style="${noticeStyle}padding:10px 14px;border-radius:6px;margin:8px 0;font-size:13px;">${formatInlineMarkdown(line)}</div>`);
      i += 1; continue;
    }
    parts.push(`<p style="margin:6px 0;">${formatInlineMarkdown(line)}</p>`);
    i += 1;
  }
  parts.push("</div>");
  return parts.join("\n");
}

export function cleanOdooBody(html: string): string {
  let text = (html || "").replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, "").replace(/\s+/g, " ").trim();
  return text.replace(/@?[\w\u4e00-\u9fa5\-_. ]+AI\s*/g, "").trim();
}
