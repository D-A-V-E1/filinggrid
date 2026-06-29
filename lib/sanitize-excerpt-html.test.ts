import { describe, expect, it } from "vitest";
import { sanitizeExcerptHtml } from "./sanitize-excerpt-html";

describe("sanitizeExcerptHtml", () => {
  it("removes base, link, and img tags that would fetch relative SEC assets", () => {
    const html =
      '<base href="/api/backend/parse/"><link href="s_00005086326000079"><img src="s_00005086326000079"><p>Related party text</p>';
    const out = sanitizeExcerptHtml(html);
    expect(out).toContain("Related party text");
    expect(out.toLowerCase()).not.toContain("<base");
    expect(out.toLowerCase()).not.toContain("<link");
    expect(out.toLowerCase()).not.toContain("<img");
    expect(out).not.toContain("s_00005086326000079");
  });

  it("unwraps anchors to plain text", () => {
    const out = sanitizeExcerptHtml('<a href="s_00005086326000079">See note</a>');
    expect(out).toBe("See note");
  });
});
