/**
 * Realistic Zotero API response fixtures for testing.
 */

import type { ZoteroItem, ZoteroCollection } from "../../src/zotero-client.js";

export const journalArticle: ZoteroItem = {
  key: "ABCD1234",
  version: 1,
  data: {
    key: "ABCD1234",
    itemType: "journalArticle",
    title: "Making It Explicit: Reasoning, Representing, and Discursive Commitment",
    creators: [
      { creatorType: "author", firstName: "Robert", lastName: "Brandom" },
    ],
    date: "1994",
    abstractNote: "An exploration of the nature of linguistic meaning and rationality.",
    publicationTitle: "Philosophy and Phenomenological Research",
    volume: "54",
    issue: "4",
    pages: "895-908",
    DOI: "10.2307/2108418",
    tags: [{ tag: "pragmatism" }, { tag: "inferentialism" }],
    collections: ["COL001"],
    dateAdded: "2024-01-15T10:00:00Z",
    dateModified: "2024-01-15T10:00:00Z",
  },
  csljson: {
    id: "ABCD1234",
    type: "article-journal",
    title: "Making It Explicit: Reasoning, Representing, and Discursive Commitment",
    author: [{ family: "Brandom", given: "Robert" }],
    issued: { "date-parts": [[1994]] },
    "container-title": "Philosophy and Phenomenological Research",
    volume: "54",
    issue: "4",
    page: "895-908",
    DOI: "10.2307/2108418",
  },
};

export const book: ZoteroItem = {
  key: "EFGH5678",
  version: 1,
  data: {
    key: "EFGH5678",
    itemType: "book",
    title: "Between Saying and Doing",
    creators: [
      { creatorType: "author", firstName: "Robert", lastName: "Brandom" },
    ],
    date: "2008",
    publisher: "Oxford University Press",
    place: "Oxford",
    ISBN: "978-0-19-954287-1",
    tags: [{ tag: "pragmatism" }],
    collections: ["COL001"],
    dateAdded: "2024-02-10T14:00:00Z",
    dateModified: "2024-02-10T14:00:00Z",
  },
  csljson: {
    id: "EFGH5678",
    type: "book",
    title: "Between Saying and Doing",
    author: [{ family: "Brandom", given: "Robert" }],
    issued: { "date-parts": [[2008]] },
    publisher: "Oxford University Press",
    "publisher-place": "Oxford",
    ISBN: "978-0-19-54287-1",
  },
};

export const bookSection: ZoteroItem = {
  key: "IJKL9012",
  version: 1,
  data: {
    key: "IJKL9012",
    itemType: "bookSection",
    title: "Some Pragmatist Themes in Hegel's Idealism",
    creators: [
      { creatorType: "author", firstName: "Robert", lastName: "Brandom" },
    ],
    date: "2011",
    bookTitle: "A Spirit of Trust",
    publisher: "Harvard University Press",
    pages: "164-209",
    tags: [],
    collections: [],
    dateAdded: "2024-03-01T09:00:00Z",
    dateModified: "2024-03-01T09:00:00Z",
  },
};

export const multiAuthorArticle: ZoteroItem = {
  key: "MNOP3456",
  version: 1,
  data: {
    key: "MNOP3456",
    itemType: "journalArticle",
    title: "Collaborative Reasoning in Social Contexts",
    creators: [
      { creatorType: "author", firstName: "Alice", lastName: "Smith" },
      { creatorType: "author", firstName: "Bob", lastName: "Jones" },
      { creatorType: "author", firstName: "Carol", lastName: "Williams" },
    ],
    date: "2020-06-15",
    publicationTitle: "Cognitive Science",
    volume: "44",
    pages: "1-32",
    tags: [],
    collections: [],
    dateAdded: "2024-04-01T08:00:00Z",
    dateModified: "2024-04-01T08:00:00Z",
  },
  csljson: {
    id: "MNOP3456",
    type: "article-journal",
    title: "Collaborative Reasoning in Social Contexts",
    author: [
      { family: "Smith", given: "Alice" },
      { family: "Jones", given: "Bob" },
      { family: "Williams", given: "Carol" },
    ],
    issued: { "date-parts": [[2020, 6, 15]] },
    "container-title": "Cognitive Science",
    volume: "44",
    page: "1-32",
  },
};

export const thesis: ZoteroItem = {
  key: "QRST7890",
  version: 1,
  data: {
    key: "QRST7890",
    itemType: "thesis",
    title: "Normative Pragmatics and the Foundations of Discursive Practice",
    creators: [
      { creatorType: "author", firstName: "Jane", lastName: "Doe" },
    ],
    date: "2019",
    publisher: "University of Pittsburgh",
    tags: [],
    collections: [],
    dateAdded: "2024-05-01T10:00:00Z",
    dateModified: "2024-05-01T10:00:00Z",
  },
};

export const itemWithoutDate: ZoteroItem = {
  key: "NODATE01",
  version: 1,
  data: {
    key: "NODATE01",
    itemType: "book",
    title: "A Book Without a Date",
    creators: [
      { creatorType: "author", firstName: "Unknown", lastName: "Author" },
    ],
    tags: [],
    collections: [],
    dateAdded: "2024-01-01T00:00:00Z",
    dateModified: "2024-01-01T00:00:00Z",
  },
};

export const noteChild: ZoteroItem = {
  key: "NOTE0001",
  version: 1,
  data: {
    key: "NOTE0001",
    itemType: "note",
    title: "",
    note: "<p>This is a <strong>very important</strong> note about the article.</p><p>It has <em>multiple</em> paragraphs.</p>",
    creators: [],
    tags: [],
    collections: [],
    dateAdded: "2024-01-16T10:00:00Z",
    dateModified: "2024-01-16T10:00:00Z",
  },
};

export const annotationChild: ZoteroItem = {
  key: "ANN00001",
  version: 1,
  data: {
    key: "ANN00001",
    itemType: "annotation",
    title: "",
    annotationText: "The key contribution of this paper is the normative account of reasoning.",
    annotationComment: "This connects well to the inferentialist project.",
    annotationPageLabel: "42",
    annotationColor: "#ffd400",
    creators: [],
    tags: [],
    collections: [],
    dateAdded: "2024-01-17T10:00:00Z",
    dateModified: "2024-01-17T10:00:00Z",
  },
};

export const sampleCollections: ZoteroCollection[] = [
  {
    key: "COL001",
    data: {
      key: "COL001",
      name: "Pragmatism",
      parentCollection: false,
    },
  },
  {
    key: "COL002",
    data: {
      key: "COL002",
      name: "Inferentialism",
      parentCollection: "COL001",
    },
  },
];
