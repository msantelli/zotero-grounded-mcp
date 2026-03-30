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

export class ZoteroClient {
  private config: ZoteroConfig;
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor(config: ZoteroConfig) {
    this.config = config;

    if (config.mode === "local") {
      const port = config.localPort ?? 23119;
      this.baseUrl = `http://localhost:${port}/api`;
      this.headers = { "Content-Type": "application/json" };
    } else {
      if (!config.userId || !config.apiKey) {
        throw new Error("Web mode requires userId and apiKey");
      }
      this.baseUrl = `https://api.zotero.org/users/${config.userId}`;
      this.headers = {
        "Zotero-API-Version": "3",
        "Zotero-API-Key": config.apiKey,
        "Content-Type": "application/json",
      };
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

    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Get a single item by its key.
   */
  async getItem(key: string): Promise<ZoteroItem> {
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("include", "data,csljson");

    const url = `${this.baseUrl}/items/${key}?${params}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ZoteroItem;
  }

  /**
   * List all collections in the library.
   */
  async listCollections(): Promise<ZoteroCollection[]> {
    const params = new URLSearchParams();
    params.set("format", "json");
    params.set("limit", "100");

    const url = `${this.baseUrl}/collections?${params}`;
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ZoteroCollection[];
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
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ZoteroItem[];
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
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Zotero API error: ${response.status} ${response.statusText}`);
    }
    return (await response.json()) as ZoteroItem[];
  }

  /**
   * Get the CSL-JSON for multiple items (useful for building bibliographies).
   */
  async getCslJson(keys: string[]): Promise<Record<string, unknown>[]> {
    const items = await Promise.all(keys.map((k) => this.getItem(k)));
    return items
      .filter((item) => item.csljson)
      .map((item) => item.csljson as Record<string, unknown>);
  }
}
