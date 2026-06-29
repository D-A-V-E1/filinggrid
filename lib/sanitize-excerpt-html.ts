const EMBEDDED_RESOURCE_RE =
  /<\s*(script|style|link|meta|base|iframe|img|object|embed|svg|picture|source|video|audio)\b[^>]*>/gi;
const ANCHOR_RE = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;

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
      return root.innerHTML.trim();
    }
  }

  return html
    .replace(EMBEDDED_RESOURCE_RE, "")
    .replace(ANCHOR_RE, "$1")
    .trim();
}
