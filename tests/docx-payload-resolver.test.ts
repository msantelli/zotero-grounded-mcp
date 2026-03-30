import { describe, expect, it, vi } from "vitest";
import { createDocxItemPayloadResolver } from "../src/docx-payload-resolver.js";
import { journalArticle } from "./fixtures/zotero-responses.js";

describe("docx payload resolver", () => {
  it("memoizes the same key within the same library spec", async () => {
    const getItem = vi.fn().mockResolvedValue(journalArticle);
    const resolvePayload = createDocxItemPayloadResolver({
      defaultLibrarySpec: "user:1234567",
      getItem,
    });

    const first = await resolvePayload("ABCD1234", "");
    const second = await resolvePayload("ABCD1234", "");

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it("does not share cache entries across library specs", async () => {
    const getItem = vi.fn().mockResolvedValue(journalArticle);
    const resolvePayload = createDocxItemPayloadResolver({
      defaultLibrarySpec: "user:1234567",
      getItem,
    });

    const userPayload = await resolvePayload("ABCD1234", "user:1234567");
    const groupPayload = await resolvePayload("ABCD1234", "group:98765");

    expect(getItem).toHaveBeenCalledTimes(2);
    expect(userPayload.uri).toBe("http://zotero.org/users/1234567/items/ABCD1234");
    expect(groupPayload.uri).toBe("http://zotero.org/groups/98765/items/ABCD1234");
  });

  it("reuses in-flight lookups for duplicate citations", async () => {
    const getItem = vi.fn().mockImplementation(async () => journalArticle);
    const resolvePayload = createDocxItemPayloadResolver({
      defaultLibrarySpec: "user:1234567",
      getItem,
    });

    const [first, second] = await Promise.all([
      resolvePayload("ABCD1234", ""),
      resolvePayload("ABCD1234", ""),
    ]);

    expect(getItem).toHaveBeenCalledTimes(1);
    expect(first.cslJson).toBe(second.cslJson);
    expect(first.displayText).toBe("(Brandom, 1994)");
  });
});
