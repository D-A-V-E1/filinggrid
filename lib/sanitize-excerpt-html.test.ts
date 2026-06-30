import { describe, expect, it } from "vitest";
import { sanitizeExcerptHtml } from "./sanitize-excerpt-html";

// @vitest-environment happy-dom

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

  it("collapses stacked dollar and amount divs into compact financial lines", () => {
    const html = [
      "<div>",
      "<div>Cash and cash equivalents</div>",
      "<div>$</div>",
      "<div>78,779</div>",
      "<div>$</div>",
      "<div>66,207</div>",
      "<div>Marketable securities</div>",
      "<div>$</div>",
      "<div>12,345</div>",
      "</div>",
    ].join("");
    const out = sanitizeExcerptHtml(html);
    expect(out).toContain('class="excerpt-fin-line"');
    expect(out).toContain("Cash and cash equivalents");
    expect(out).toContain("$78,779");
    expect(out).toContain("$66,207");
    expect(out).toContain("Marketable securities");
    expect(out).toContain("$12,345");
    expect(out).not.toMatch(/<div>\$<\/div>/);
  });

  it("collapses br-separated tokens inside table cells", () => {
    const html =
      "<table><tr><td>Cash and cash equivalents</td>" +
      "<td align=\"right\"><br>$<br>78,779<br><br>$<br>66,207</td></tr></table>";
    const out = sanitizeExcerptHtml(html);
    expect(out).toContain("Cash and cash equivalents");
    expect(out).toContain("78,779");
    expect(out).toContain("66,207");
    expect(out).toMatch(/\$\s*78,779/);
    expect(out).not.toContain("<br");
  });

  it("preserves narrative paragraph breaks in prose blocks", () => {
    const html = "<p>First paragraph<br><br>Second paragraph</p>";
    const out = sanitizeExcerptHtml(html);
    expect(out).toContain("First paragraph");
    expect(out).toContain("Second paragraph");
    expect(out).toContain("<br");
  });
});
