import { describe, it, expect } from "vitest";
import { htmlToMarkdown } from "../src/html-utils.js";

describe("htmlToMarkdown", () => {
  it("converts paragraphs to double newlines", () => {
    expect(htmlToMarkdown("<p>First</p><p>Second</p>")).toBe("First\n\nSecond");
  });

  it("converts bold tags", () => {
    expect(htmlToMarkdown("<b>bold</b>")).toBe("**bold**");
    expect(htmlToMarkdown("<strong>bold</strong>")).toBe("**bold**");
  });

  it("converts italic tags", () => {
    expect(htmlToMarkdown("<i>italic</i>")).toBe("*italic*");
    expect(htmlToMarkdown("<em>italic</em>")).toBe("*italic*");
  });

  it("converts links", () => {
    expect(htmlToMarkdown('<a href="https://example.com">click</a>')).toBe(
      "[click](https://example.com)"
    );
  });

  it("converts line breaks", () => {
    expect(htmlToMarkdown("one<br>two<br/>three")).toBe("one\ntwo\nthree");
  });

  it("converts headings", () => {
    expect(htmlToMarkdown("<h1>Title</h1>")).toBe("# Title");
    expect(htmlToMarkdown("<h2>Sub</h2>")).toBe("## Sub");
    expect(htmlToMarkdown("<h3>Sub sub</h3>")).toBe("### Sub sub");
  });

  it("converts list items", () => {
    const html = "<ul><li>one</li><li>two</li></ul>";
    const result = htmlToMarkdown(html);
    expect(result).toContain("- one");
    expect(result).toContain("- two");
  });

  it("converts blockquotes", () => {
    expect(htmlToMarkdown("<blockquote>quoted text</blockquote>")).toBe(
      "> quoted text"
    );
  });

  it("strips unknown tags", () => {
    expect(htmlToMarkdown("<span>text</span>")).toBe("text");
    expect(htmlToMarkdown("<div class='foo'>text</div>")).toBe("text");
  });

  it("decodes HTML entities", () => {
    expect(htmlToMarkdown("&amp; &lt; &gt; &quot; &#39;")).toBe('& < > " \'');
    // &nbsp; gets converted to a space, then trim() removes it
    expect(htmlToMarkdown("hello&nbsp;world")).toContain("hello world");
  });

  it("collapses excessive newlines", () => {
    expect(htmlToMarkdown("<p></p><p></p><p>text</p>")).toBe("text");
  });

  it("handles Zotero-style note HTML", () => {
    const html =
      '<p>This is a <strong>very important</strong> note.</p><p>It has <em>multiple</em> paragraphs.</p>';
    const result = htmlToMarkdown(html);
    expect(result).toContain("**very important**");
    expect(result).toContain("*multiple*");
    expect(result).toContain("note.");
  });
});
