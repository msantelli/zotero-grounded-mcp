/**
 * Zotero API client — supports both the local Zotero connector (localhost:23119)
 * and the Zotero Web API (api.zotero.org).
 *
 * The local API is available whenever the Zotero desktop app is running.
 * The web API requires a userID and API key from https://www.zotero.org/settings/keys
 */

export interface ZoteroConfig {
  /** "local" uses the Zotero desktop app's local API; "web" uses api.zotero.org */
  mode: "local" | "web";
  /** "user" (default) or "group" — which library type to access */
  libraryType?: "user" | "group";
  /** Required for group libraries — the numeric group ID */
  groupId?: string;
  /** Required for web mode — your Zotero userID (numeric) */
  userId?: string;
  /** Required for web mode — API key from zotero.org/settings/keys */
  apiKey?: string;
  /** Local API port (default: 23119) */
  localPort?: number;
}

export interface ZoteroItem {
  key: string;
  version: number;
  data: {
    key: string;
    itemType: string;
    title: string;
    creators: Array<{
      creatorType: string;
      firstName?: string;
      lastName?: string;
      name?: string; // for single-field names (institutional authors)
    }>;
    date?: string;
    abstractNote?: string;
    publicationTitle?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    DOI?: string;
    ISBN?: string;
    ISSN?: string;
    url?: string;
    publisher?: string;
    place?: string;
    language?: string;
    bookTitle?: string;
    proceedingsTitle?: string;
    thesisType?: string;
    university?: string;
    // Attachment fields
    linkMode?: string;
    filename?: string;
    contentType?: string;
    path?: string;
    tags: Array<{ tag: string }>;
    collections: string[];
    dateAdded: string;
    dateModified: string;
    [key: string]: unknown;
  };
  csljson?: Record<string, unknown>;
}

export interface ZoteroCollection {
  key: string;
  data: {
    key: string;
    name: string;
    parentCollection: string | false;
  };
}

export type ZoteroLibraryContext =
  | { type: "user"; userId: string }
  | { type: "group"; groupId: string };

type ParsedLibrarySpec =
  | { type: "user"; id: string }
  | { type: "group"; id: string };

export class ZoteroClient {
  private config: ZoteroConfig;
  private baseUrl: string;
  private headers: Record<string, string>;
  private itemCache = new Map<string, { item: ZoteroItem; time: number }>();
  private cacheMaxAge = 30 * 60 * 1000; // 30 minutes
  private cachedUserId?: string;

  constructor(config: ZoteroConfig) {
    this.config = config;
    const isGroup = config.libraryType === "group";

    if (isGroup && !config.groupId) {
      throw new Error("Group library mode requires groupId");
    }

    if (config.mode === "local") {
      const port = config.localPort ?? 23119;
      const prefix = isGroup
        ? `/api/groups/${config.groupId}`
        : `/api/users/0`;
      this.baseUrl = `http://localhost:${port}${prefix}`;
      this.headers = { "Content-Type": "application/json" };
    } else {
      if (!config.apiKey) {
        throw new Error("Web mode requires apiKey");
      }
      if (!isGroup && !config.userId) {
        throw new Error("Web mode requires userId for user libraries");
      }
      const prefix = isGroup
        ? `/groups/${config.groupId}`
        : `/users/${config.userId}`;
      this.baseUrl = `https://api.zotero.org${prefix}`;
      this.headers = {
        "Zotero-API-Version": "3",
        "Zotero-API-Key": config.apiKey,
        "Content-Type": "application/json",
      };
    }
  }

  private getCached(key: string): ZoteroItem | undefined {
    const entry = this.itemCache.get(key);
    if (entry && Date.now() - entry.time < this.cacheMaxAge) {
      return entry.item;
    }
    if (entry) this.itemCache.delete(key);
    return undefined;
  }

  private putCache(item: ZoteroItem): void {
    this.itemCache.set(item.key, { item, time: Date.now() });
  }

  private getCachedForLibrary(key: string, librarySpec: string): ZoteroItem | undefined {
    return this.getCached(`${librarySpec}::${key}`);
  }

  private putCacheForLibrary(item: ZoteroItem, librarySpec: string): void {
    this.itemCache.set(`${librarySpec}::${item.key}`, {
      item,
      time: Date.now(),
    });
  }

  private parseLibrarySpec(librarySpec: string): ParsedLibrarySpec {
    const match = /^(user|group):(.+)$/.exec(librarySpec);
    if (!match) {
      throw new Error(`Invalid library spec: ${librarySpec}`);
    }
    return match[1] === "group"
      ? { type: "group", id: match[2] }
      : { type: "user", id: match[2] };
  }

  private getBaseUrlForLibrarySpec(librarySpec: string): string {
    const parsed = this.parseLibrarySpec(librarySpec);
    if (this.config.mode === "local") {
      const port = this.config.localPort ?? 23119;
      const prefix =
        parsed.type === "group" ? `/api/groups/${parsed.id}` : "/api/users/0";
      return `http://localhost:${port}${prefix}`;
    }

    const prefix =
      parsed.type === "group" ? `/groups/${parsed.id}` : `/users/${parsed.id}`;
    return `https://api.zotero.org${prefix}`;
  }

  private getConfiguredLibrarySpec(): string {
    if (this.config.libraryType === "group") {
      if (!this.config.groupId) {
        throw new Error("Group library mode requires groupId");
      }
      return `group:${this.config.groupId}`;
    }

    return `user:${this.config.userId ?? "0"}`;
  }

  /**
   * Normalize a ZoteroItem's csljson field.
   * The Zotero API returns csljson as a JSON string wrapping an array; we want
   * a parsed object (the first element of that array).
   */
  private normalizeCslJson(item: ZoteroItem): ZoteroItem {
    if (typeof item.csljson === "string") {
      try {
        const parsed = JSON.parse(item.csljson as unknown as string);
        item.csljson = Array.isArray(parsed) ? parsed[0] : parsed;
      } catch {
        item.csljson = undefined;
      }
    } else if (Array.isArray(item.csljson)) {
      item.csljson = (item.csljson as unknown as Record<string, unknown>[])[0];
    }
    return item;
  }

  /**
   * Centralized HTTP request with error handling and timeout.
   */
  private async request(url: string): Promise<Response> {
    try {
      const response = await fetch(url, {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(
          `Zotero API error: ${response.status} ${response.statusText}`
        );
      }
      return response;
    } catch (error) {
      if (error instanceof TypeError) {
        const cause = (error as TypeError & { cause?: { code?: string } }).cause;
        if (cause?.code === "ECONNREFUSED") {
          throw new Error(
            "Could not connect to Zotero. Is Zotero desktop running? " +
              `(tried ${url.split("?")[0]})`
          );
        }
      }
      if (error instanceof DOMException && error.name === "TimeoutError") {
        throw new Error("Zotero API request timed out after 10 seconds.");
      }
      throw error;
    }
  }

  /**
   * Search items by query string. Searches across title, creator, and year fields.
   */
  async searchItems(
    query: string,
    options?: { limit?: number; tag?: string; collection?: string }
  ): Promise<ZoteroItem[]> {
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("limit", String(options?.limit ?? 25));
    params.set("format", "json");
    params.set("include", "data,csljson");
    params.set("sort", "date");
    params.set("direction", "desc");
    if (options?.tag) params.set("tag", options.tag);

    let url: string;
    if (options?.collection) {
      url = `${this.baseUrl}/collections/${options.collection}/items?${params}`;
    } else {
      url = `${this.baseUrl}/items?${params}`;
    }

    const response = await this.request(url);
    const items = (await response.json()) as ZoteroItem[];
    return items.map((i) => this.normalizeCslJson(i));
  }

  /**
   * Get a single item by its key.
   */
  async getItem(key: string): Promise<ZoteroItem> {
    const cacheKey = `${this.getConfiguredLibrarySpec()}::${key}`;
    const cached = this.getCached(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("include", "data,csljson");

    const url = `${this.baseUrl}/items/${key}?${params}`;
    const response = await this.request(url);
    const item = this.normalizeCslJson((await response.json()) as ZoteroItem);
    this.itemCache.set(cacheKey, { item, time: Date.now() });
    return item;
  }

  /**
   * Get a single item by key from an explicit user/group library context.
   * This is used by .docx processing where a single document may mix libraries.
   */
  async getItemForLibrarySpec(key: string, librarySpec: string): Promise<ZoteroItem> {
    const cached = this.getCachedForLibrary(key, librarySpec);
    if (cached) return cached;

    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("include", "data,csljson");

    const baseUrl = this.getBaseUrlForLibrarySpec(librarySpec);
    const url = `${baseUrl}/items/${key}?${params}`;
    const response = await this.request(url);
    const item = this.normalizeCslJson((await response.json()) as ZoteroItem);
    this.putCacheForLibrary(item, librarySpec);
    return item;
  }

  /**
   * List all collections in the library, with automatic pagination.
   */
  async listCollections(): Promise<ZoteroCollection[]> {
    const pageSize = 100;
    let start = 0;
    const allCollections: ZoteroCollection[] = [];

    while (true) {
      const params = new URLSearchParams();
      params.set("format", "json");
      params.set("limit", String(pageSize));
      params.set("start", String(start));

      const url = `${this.baseUrl}/collections?${params}`;
      const response = await this.request(url);
      const page = (await response.json()) as ZoteroCollection[];
      allCollections.push(...page);

      const totalResults = response.headers.get("Total-Results");
      if (
        !totalResults ||
        allCollections.length >= parseInt(totalResults, 10) ||
        page.length < pageSize
      ) {
        break;
      }
      start += pageSize;
    }

    return allCollections;
  }

  /**
   * Get items in a specific collection.
   */
  async getCollectionItems(
    collectionKey: string,
    options?: { limit?: number }
  ): Promise<ZoteroItem[]> {
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("include", "data,csljson");
    params.set("limit", String(options?.limit ?? 50));
    params.set("sort", "date");
    params.set("direction", "desc");

    const url = `${this.baseUrl}/collections/${collectionKey}/items?${params}`;
    const response = await this.request(url);
    const items = (await response.json()) as ZoteroItem[];
    return items.map((i) => this.normalizeCslJson(i));
  }

  /**
   * Search by tag.
   */
  async getItemsByTag(
    tag: string,
    options?: { limit?: number }
  ): Promise<ZoteroItem[]> {
    const params = new URLSearchParams();
    params.set("tag", tag);
    params.set("format", "json");
    params.set("include", "data,csljson");
    params.set("limit", String(options?.limit ?? 50));

    const url = `${this.baseUrl}/items?${params}`;
    const response = await this.request(url);
    const items = (await response.json()) as ZoteroItem[];
    return items.map((i) => this.normalizeCslJson(i));
  }

  /**
   * Get child items (notes, annotations) for a given item.
   */
  async getItemChildren(itemKey: string): Promise<ZoteroItem[]> {
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("include", "data");

    const url = `${this.baseUrl}/items/${itemKey}/children?${params}`;
    const response = await this.request(url);
    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Get multiple items in a single API call using the itemKey parameter.
   * Falls back to individual requests if the batch endpoint fails.
   */
  async getItems(keys: string[]): Promise<ZoteroItem[]> {
    if (keys.length === 0) return [];
    const librarySpec = this.getConfiguredLibrarySpec();

    // Collect cached items and identify misses
    const itemMap = new Map<string, ZoteroItem>();
    const missingKeys: string[] = [];
    for (const key of keys) {
      const cached = this.getCached(`${librarySpec}::${key}`);
      if (cached) {
        itemMap.set(key, cached);
      } else {
        missingKeys.push(key);
      }
    }

    // Fetch missing items
    if (missingKeys.length === 1) {
      const item = await this.getItem(missingKeys[0]);
      itemMap.set(item.key, item);
    } else if (missingKeys.length > 1) {
      const params = new URLSearchParams();
      params.set("itemKey", missingKeys.join(","));
      params.set("format", "json");
      params.set("include", "data,csljson");

      const url = `${this.baseUrl}/items?${params}`;
      const response = await this.request(url);
      const items = (await response.json()) as ZoteroItem[];
      const keySet = new Set(missingKeys);
      for (const item of items) {
        if (keySet.has(item.key)) {
          const normalized = this.normalizeCslJson(item);
          this.putCacheForLibrary(normalized, librarySpec);
          itemMap.set(normalized.key, normalized);
        }
      }
    }

    // Return in the same order as the input keys
    return keys
      .map((key) => itemMap.get(key))
      .filter((item): item is ZoteroItem => item !== undefined);
  }

  /**
   * Get the CSL-JSON for multiple items (useful for building bibliographies).
   */
  async getCslJson(keys: string[]): Promise<Record<string, unknown>[]> {
    const items = await this.getItems(keys);
    return items
      .filter((item) => item.csljson)
      .map((item) => item.csljson as Record<string, unknown>);
  }

  /**
   * Get the Zotero user ID (numeric).
   * In web mode, returns the configured userId.
   * In local mode, queries the running Zotero app. Cached for the session.
   */
  async getUserId(): Promise<string> {
    if (this.cachedUserId) return this.cachedUserId;
    if (this.config.userId) {
      this.cachedUserId = this.config.userId;
      return this.cachedUserId;
    }

    // Local mode: extract user ID from any item's library field,
    // since /api/users/0 is not a valid endpoint on the local API.
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("limit", "1");
    const url = `${this.baseUrl}/items?${params}`;
    const response = await this.request(url);
    const items = (await response.json()) as Array<{ library?: { id?: number } }>;
    const id = items[0]?.library?.id;
    if (!id) throw new Error("Could not determine Zotero user ID from library items");
    this.cachedUserId = String(id);
    return this.cachedUserId;
  }

  /**
   * Get the active library context for downstream tools.
   */
  async getLibraryContext(): Promise<ZoteroLibraryContext> {
    if (this.config.libraryType === "group") {
      if (!this.config.groupId) {
        throw new Error("Group library mode requires groupId");
      }
      return { type: "group", groupId: this.config.groupId };
    }

    return { type: "user", userId: await this.getUserId() };
  }

  /**
   * Test connectivity to the Zotero API. Returns true if reachable.
   */
  async testConnection(): Promise<boolean> {
    try {
      const params = new URLSearchParams();
      params.set("format", "json");
      params.set("limit", "1");
      const url = `${this.baseUrl}/items?${params}`;
      await this.request(url);
      return true;
    } catch {
      return false;
    }
  }
}
