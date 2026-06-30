const EMBEDDED_RESOURCE_RE =
  /<\s*(script|style|link|meta|base|iframe|img|object|embed|svg|picture|source|video|audio)\b[^>]*>/gi;
const ANCHOR_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

const DOLLAR_ONLY_RE = /^\$\s*$/;
const AMOUNT_RE = /^[\d,.\s()%\-]+$/;

function isDollarToken(text: string): boolean {
  return DOLLAR_ONLY_RE.test(text.trim());
}

function isAmountToken(text: string): boolean {
  const t = text.trim();
  if (!t || isDollarToken(t)) return false;
  if (t.startsWith("$")) return /\d/.test(t);
  return AMOUNT_RE.test(t) && /\d/.test(t);
}

function isFinancialLabel(text: string): boolean {
  const t = text.trim();
  if (!t || t.length < 3) return false;
  if (isDollarToken(t) || isAmountToken(t)) return false;
  return /[A-Za-z]/.test(t);
}

function normalizeAmountToken(text: string): string {
  const t = text.trim();
  if (t.startsWith("$")) return t.replace(/\s+/g, "");
  return `$${t.replace(/\s+/g, "")}`;
}

function parseFinancialTokenRun(tokens: string[]): { label: string; amounts: string[] } | null {
  if (tokens.length < 2 || !isFinancialLabel(tokens[0])) return null;

  const amounts: string[] = [];
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i].trim();
    if (!token) {
      i += 1;
      continue;
    }
    if (isDollarToken(token)) {
      const next = tokens[i + 1]?.trim() ?? "";
      if (!isAmountToken(next) && !/^\d/.test(next)) break;
      amounts.push(normalizeAmountToken(`$${next}`));
      i += 2;
      continue;
    }
    if (isAmountToken(token)) {
      amounts.push(normalizeAmountToken(token));
      i += 1;
      continue;
    }
    break;
  }

  return amounts.length > 0 ? { label: tokens[0].trim(), amounts } : null;
}

function collectFinancialRowDivs(nodes: Node[], start: number): { start: number; end: number; tokens: string[] } | null {
  const first = nodes[start];
  if (!(first instanceof Element) || first.tagName !== "DIV" || first.classList.contains("filing-table-wrap")) {
    return null;
  }
  if (first.querySelector("table") || first.querySelector("div, p, ul, ol")) {
    return null;
  }

  const labelText = (first.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!isFinancialLabel(labelText)) return null;

  const tokens = [labelText];
  let end = start;
  let i = start + 1;
  while (i < nodes.length) {
    const node = nodes[i];
    if (!(node instanceof Element) || node.tagName !== "DIV" || node.classList.contains("filing-table-wrap")) {
      break;
    }
    if (node.querySelector("table") || node.querySelector("div, p, ul, ol")) {
      break;
    }
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      end = i;
      i += 1;
      continue;
    }
    if (isDollarToken(text) || isAmountToken(text)) {
      tokens.push(text);
      end = i;
      i += 1;
      continue;
    }
    if (isFinancialLabel(text)) break;
    break;
  }

  return tokens.length >= 2 ? { start, end, tokens } : null;
}

function buildFinancialLine(doc: Document, label: string, amounts: string[]): HTMLDivElement {
  const line = doc.createElement("div");
  line.className = "excerpt-fin-line";

  const labelEl = doc.createElement("span");
  labelEl.className = "excerpt-fin-label";
  labelEl.textContent = label;
  line.appendChild(labelEl);

  const values = doc.createElement("span");
  values.className = "excerpt-fin-values";
  for (const amount of amounts) {
    const amt = doc.createElement("span");
    amt.className = "excerpt-fin-amt";
    amt.textContent = amount;
    values.appendChild(amt);
  }
  line.appendChild(values);
  return line;
}

function mergeStackedFinancialDivs(root: Element, doc: Document): void {
  const containers: Element[] = [root];
  root.querySelectorAll("div:not(.filing-table-wrap)").forEach((div) => {
    if (div.querySelector("table") || div.classList.contains("filing-table-wrap")) return;
    if (Array.from(div.childNodes).some((child) => child instanceof Element && child.tagName === "DIV")) {
      containers.push(div);
    }
  });

  for (const container of containers) {
    const nodes = Array.from(container.childNodes);
    let i = 0;
    while (i < nodes.length) {
      const run = collectFinancialRowDivs(nodes, i);
      if (!run) {
        i += 1;
        continue;
      }

      const parsed = parseFinancialTokenRun(run.tokens);
      if (!parsed) {
        i = run.end + 1;
        continue;
      }

      const line = buildFinancialLine(doc, parsed.label, parsed.amounts);
      const anchor = nodes[run.start];
      container.insertBefore(line, anchor);
      for (let j = run.start; j <= run.end; j += 1) {
        nodes[j]?.parentNode?.removeChild(nodes[j]!);
      }
      i = run.start + 1;
      nodes.splice(run.start, run.end - run.start + 1, line);
    }
  }
}

function unwrapInlineWrappers(cell: Element): void {
  cell.querySelectorAll("div, p, span").forEach((el) => {
    if (el.querySelector("table")) return;
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
  });
}

function collapseCellWhitespace(cell: Element): void {
  cell.querySelectorAll("br").forEach((br) => br.replaceWith(" "));
  unwrapInlineWrappers(cell);
  const text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
  cell.textContent = text;
}

function collapseConsecutiveBreaks(root: Element): void {
  root.querySelectorAll("br").forEach((br) => {
    if (br.closest("td, th")) return;
    let next = br.nextSibling;
    while (next instanceof Element && next.tagName === "BR") {
      const remove = next;
      next = next.nextSibling;
      remove.remove();
    }
  });
}

function compactExcerptLayout(root: Element, doc: Document): void {
  root.querySelectorAll("td, th").forEach((cell) => collapseCellWhitespace(cell));
  collapseConsecutiveBreaks(root);
  mergeStackedFinancialDivs(root, doc);
}

function compactTableCellsRegex(html: string): string {
  return html.replace(/<(td|th)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (_match, tag, attrs, body) => {
    const collapsed = body
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?(?:div|p|span)\b[^>]*>/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    return `<${tag}${attrs}>${collapsed}</${tag}>`;
  });
}

/** Strip tags/attrs that trigger spurious network requests when injected via innerHTML. */
export function sanitizeExcerptHtml(html: string): string {
  if (!html?.trim()) return html;

  if (typeof DOMParser !== "undefined") {
    const doc = new DOMParser().parseFromString(`<div id="excerpt-root">${html}</div>`, "text/html");
    const root = doc.getElementById("excerpt-root");
    if (root) {
      const removeTags = [
        "script",
        "style",
        "link",
        "meta",
        "base",
        "iframe",
        "img",
        "object",
        "embed",
        "svg",
        "picture",
        "source",
        "video",
        "audio",
      ];
      for (const tag of removeTags) {
        root.querySelectorAll(tag).forEach((el) => el.remove());
      }
      root.querySelectorAll("a").forEach((anchor) => {
        const text = anchor.textContent ?? "";
        anchor.replaceWith(doc.createTextNode(text));
      });
      compactExcerptLayout(root, doc);
      return root.innerHTML.trim();
    }
  }

  return compactTableCellsRegex(html)
    .replace(EMBEDDED_RESOURCE_RE, "")
    .replace(ANCHOR_RE, "$1")
    .replace(/(<br\s*\/?>\s*){3,}/gi, "<br><br>")
    .trim();
}
