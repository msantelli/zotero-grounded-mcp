import { describe, it, expect, vi, beforeEach } from "vitest";
import { ZoteroClient } from "../src/zotero-client.js";
import {
  book,
  journalArticle,
  sampleCollections,
  noteChild,
  annotationChild,
} from "./fixtures/zotero-responses.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, headers?: Record<string, string>) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve(data),
    headers: new Headers(headers ?? {}),
  };
}

function mockErrorResponse(status: number, statusText: string) {
  return {
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
    headers: new Headers(),
  };
}

describe("ZoteroClient — local mode", () => {
  let client: ZoteroClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new ZoteroClient({ mode: "local" });
  });

  it("constructs local base URL with default port", () => {
    mockFetch.mockResolvedValueOnce(mockResponse([journalArticle]));
    client.searchItems("test");
    expect(mockFetch).toHaveBeenCalledOnce();
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://localhost:23119/api/users/0/items");
  });

  it("constructs local base URL with custom port", () => {
    const customClient = new ZoteroClient({ mode: "local", localPort: 9999 });
    mockFetch.mockResolvedValueOnce(mockResponse([journalArticle]));
    customClient.searchItems("test");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://localhost:9999/api/users/0/items");
  });

  describe("searchItems", () => {
    it("passes query and default params", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([journalArticle]));
      const results = await client.searchItems("Brandom");
      expect(results).toHaveLength(1);
      expect(results[0].key).toBe("ABCD1234");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("q=Brandom");
      expect(url).toContain("include=data%2Ccsljson");
    });

    it("passes tag filter", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await client.searchItems("test", { tag: "pragmatism" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("tag=pragmatism");
    });

    it("searches within a collection", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse([]));
      await client.searchItems("test", { collection: "COL001" });
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/collections/COL001/items");
    });
  });

  describe("getItem", () => {
    it("fetches a single item by key", async () => {
      mockFetch.mockResolvedValueOnce(mockResponse(journalArticle));
      const item = await client.getItem("ABCD1234");
      expect(item.key).toBe("ABCD1234");
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/items/ABCD1234");
    });
  });

  describe("getItems", () => {
    it("returns items in the same order as the requested keys", async () => {
      mockFetch
        .mockResolvedValueOnce(mockResponse(journalArticle))
        .mockResolvedValueOnce(mockResponse(book));

      await client.getItem("ABCD1234");
      const items = await client.getItems(["EFGH5678", "ABCD1234"]);

      expect(items.map((item) => item.key)).toEqual(["EFGH5678", "ABCD1234"]);
    });
  });

  describe("listCollections", () => {
    it("fetches collections", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(sampleCollections, { "Total-Results": "2" })
      );
      const collections = await client.listCollections();
      expect(collections).toHaveLength(2);
      expect(collections[0].data.name).toBe("Pragmatism");
    });

    it("paginates when Total-Results exceeds page size", async () => {
      // First page: 100 items, total is 150
      const firstPage = Array.from({ length: 100 }, (_, i) => ({
        key: `COL${String(i).padStart(3, "0")}`,
        data: {
          key: `COL${String(i).padStart(3, "0")}`,
          name: `Collection ${i}`,
          parentCollection: false as const,
        },
      }));
      const secondPage = Array.from({ length: 50 }, (_, i) => ({
        key: `COL${String(i + 100).padStart(3, "0")}`,
        data: {
          key: `COL${String(i + 100).padStart(3, "0")}`,
          name: `Collection ${i + 100}`,
          parentCollection: false as const,
        },
      }));

      mockFetch
        .mockResolvedValueOnce(
          mockResponse(firstPage, { "Total-Results": "150" })
        )
        .mockResolvedValueOnce(
          mockResponse(secondPage, { "Total-Results": "150" })
        );

      const collections = await client.listCollections();
      expect(collections).toHaveLength(150);
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second call should have start=100
      const secondUrl = mockFetch.mock.calls[1][0] as string;
      expect(secondUrl).toContain("start=100");
    });
  });

  describe("getItemChildren", () => {
    it("fetches child items", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse([noteChild, annotationChild])
      );
      const children = await client.getItemChildren("ABCD1234");
      expect(children).toHaveLength(2);
      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain("/items/ABCD1234/children");
    });
  });

  describe("error handling", () => {
    it("throws on HTTP error", async () => {
      mockFetch.mockResolvedValueOnce(mockErrorResponse(404, "Not Found"));
      await expect(client.getItem("NONEXIST")).rejects.toThrow(
        "Zotero API error: 404"
      );
    });

    it("throws friendly message on ECONNREFUSED", async () => {
      const connError = new TypeError("fetch failed");
      (connError as any).cause = { code: "ECONNREFUSED" };
      mockFetch.mockRejectedValueOnce(connError);
      await expect(client.getItem("ABCD1234")).rejects.toThrow(
        "Could not connect to Zotero"
      );
    });

    it("throws on timeout", async () => {
      const timeoutError = new DOMException("The operation was aborted", "TimeoutError");
      mockFetch.mockRejectedValueOnce(timeoutError);
      await expect(client.getItem("ABCD1234")).rejects.toThrow(
        "timed out"
      );
    });
  });

  describe("library context", () => {
    it("gets the local user id from an item's library field", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse([{ library: { id: 1234567 } }])
      );

      const context = await client.getLibraryContext();

      expect(context).toEqual({ type: "user", userId: "1234567" });
      expect(mockFetch).toHaveBeenCalledOnce();
    });
  });
});

describe("ZoteroClient — web mode", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("requires apiKey", () => {
    expect(() => new ZoteroClient({ mode: "web" })).toThrow(
      "Web mode requires apiKey"
    );
  });

  it("requires userId for user libraries", () => {
    expect(() => new ZoteroClient({ mode: "web", apiKey: "abc" })).toThrow(
      "Web mode requires userId for user libraries"
    );
  });

  it("constructs web base URL", async () => {
    const client = new ZoteroClient({
      mode: "web",
      userId: "12345",
      apiKey: "abc",
    });
    mockFetch.mockResolvedValueOnce(mockResponse([journalArticle]));
    await client.searchItems("test");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("https://api.zotero.org/users/12345/items");
  });

  it("includes API headers", async () => {
    const client = new ZoteroClient({
      mode: "web",
      userId: "12345",
      apiKey: "mykey",
    });
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await client.searchItems("test");
    const opts = mockFetch.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers["Zotero-API-Key"]).toBe("mykey");
    expect(headers["Zotero-API-Version"]).toBe("3");
  });
});

describe("ZoteroClient — group library", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("requires groupId for group library type", () => {
    expect(
      () => new ZoteroClient({ mode: "local", libraryType: "group" })
    ).toThrow("Group library mode requires groupId");
  });

  it("constructs local group URL", async () => {
    const client = new ZoteroClient({
      mode: "local",
      libraryType: "group",
      groupId: "98765",
    });
    mockFetch.mockResolvedValueOnce(mockResponse([journalArticle]));
    await client.searchItems("test");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("http://localhost:23119/api/groups/98765/items");
  });

  it("constructs web group URL", async () => {
    const client = new ZoteroClient({
      mode: "web",
      libraryType: "group",
      groupId: "98765",
      apiKey: "abc",
    });
    mockFetch.mockResolvedValueOnce(mockResponse([]));
    await client.searchItems("test");
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("https://api.zotero.org/groups/98765/items");
  });

  it("returns group library context without fetching", async () => {
    const client = new ZoteroClient({
      mode: "local",
      libraryType: "group",
      groupId: "98765",
    });

    const context = await client.getLibraryContext();

    expect(context).toEqual({ type: "group", groupId: "98765" });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
