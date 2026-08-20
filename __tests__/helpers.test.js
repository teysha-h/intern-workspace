// __tests__/helpers.test.js
//
// Unit tests for the pure helper functions in helpers.js.
// These tests are deterministic and independent: every test passes explicit
// inputs and any environment differences (Number.parseInt, crypto) are handled
// with narrow, restored stubs inside the test file only.

const helpers = require("../helpers.js");

const {
  normalizeComments,
  normalizeTicket,
  commentsToTextarea,
  parseComments,
  formatTimestamp,
  getNextTicketId,
  parseTicketId,
  sortTickets,
  filterTickets,
  formatDueDate,
  toDateInputValue,
  nextTodoId,
  filterTodos,
  groupDocumentsByFirstWord,
  contactMatchesQuery,
  deepEqual,
  refreshSnapshotMatches,
} = helpers;

// app.js uses the non-standard `Number.parseInt(...)`; Node.js does not expose
// it. Polyfill it here (test-only) so the helpers behave identically to the
// browser environment, without touching the production files.
beforeAll(() => {
  if (typeof Number.parseInt !== "function") {
    Number.parseInt = parseInt;
  }
});

describe("normalizeComments", () => {
  const FIXED = "2026-01-01T00:00:00.000Z";

  test("returns [] for falsy comment values", () => {
    expect(normalizeComments(null, FIXED)).toEqual([]);
    expect(normalizeComments(undefined, FIXED)).toEqual([]);
    expect(normalizeComments("", FIXED)).toEqual([]);
  });

  test("normalizes plain string comments with a fallback timestamp", () => {
    expect(normalizeComments(["hello", "world"], FIXED)).toEqual([
      { text: "hello", timestamp: FIXED },
      { text: "world", timestamp: FIXED },
    ]);
  });

  test("keeps existing timestamps on object comments", () => {
    const comments = [{ text: "hi", timestamp: "2020-05-05T00:00:00.000Z" }];
    expect(normalizeComments(comments, FIXED)).toEqual([
      { text: "hi", timestamp: "2020-05-05T00:00:00.000Z" },
    ]);
  });

  test("drops null, non-object, non-string, and empty-text entries", () => {
    expect(
      normalizeComments([null, 42, {}, { text: "" }, { text: "ok" }], FIXED)
    ).toEqual([{ text: "ok", timestamp: FIXED }]);
  });

  test("returns [] when an object is not an array", () => {
    expect(normalizeComments({ text: "nope" }, FIXED)).toEqual([]);
  });
});

describe("normalizeTicket", () => {
  test("attaches normalized comments and preserves other fields", () => {
    const ticket = { id: "T-0001", title: "Hi", timestamp: "2026-01-01T00:00:00.000Z", comments: ["a", "b"] };
    expect(normalizeTicket(ticket)).toEqual({
      id: "T-0001",
      title: "Hi",
      timestamp: "2026-01-01T00:00:00.000Z",
      comments: [
        { text: "a", timestamp: "2026-01-01T00:00:00.000Z" },
        { text: "b", timestamp: "2026-01-01T00:00:00.000Z" },
      ],
    });
  });

  test("handles a ticket with missing comments", () => {
    expect(normalizeTicket({ id: "T-0002" })).toEqual({ id: "T-0002", comments: [] });
  });
});

describe("commentsToTextarea", () => {
  test("joins comment texts with newlines", () => {
    expect(commentsToTextarea([{ text: "a" }, { text: "b" }, { text: "c" }])).toBe("a\nb\nc");
  });

  test("returns empty string for non-arrays", () => {
    expect(commentsToTextarea(null)).toBe("");
    expect(commentsToTextarea("a")).toBe("");
  });
});

describe("parseComments", () => {
  test("splits, trims, and drops blank lines", () => {
    expect(parseComments(" one \n\n  two \r\nthree ")).toEqual([
      { text: "one", timestamp: expect.any(String) },
      { text: "two", timestamp: expect.any(String) },
      { text: "three", timestamp: expect.any(String) },
    ]);
  });

  test("preserves the timestamp of a matching existing comment", () => {
    const existing = [{ text: "keep me", timestamp: "1999-01-01T00:00:00.000Z" }];
    const result = parseComments("keep me\nnew one", existing);
    expect(result[0]).toEqual({ text: "keep me", timestamp: "1999-01-01T00:00:00.000Z" });
    expect(result[1].timestamp).toEqual(expect.any(String));
  });

  test("returns [] for empty input", () => {
    expect(parseComments("", [])).toEqual([]);
    expect(parseComments(null, [])).toEqual([]);
  });
});

describe("formatTimestamp", () => {
  test("returns the raw value for invalid timestamps", () => {
    expect(formatTimestamp("not-a-date")).toBe("not-a-date");
  });

  test("returns a formatted string for a valid timestamp", () => {
    const out = formatTimestamp(new Date(2026, 0, 15, 10, 30).toISOString());
    expect(typeof out).toBe("string");
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("2026");
  });
});
describe("getNextTicketId", () => {
  test("returns T-0001 for empty tickets", () => {
    expect(getNextTicketId([])).toBe("T-0001");
  });

  test("returns the next id based on the max numeric id", () => {
    expect(getNextTicketId([{ id: "T-0001" }, { id: "T-0005" }, { id: "T-0002" }])).toBe("T-0006");
  });

  test("ignores non-numeric ids", () => {
    expect(getNextTicketId([{ id: "ABC" }, { id: "T-0003" }])).toBe("T-0004");
  });

  test("pads to four digits", () => {
    expect(getNextTicketId([{ id: "T-0009" }])).toBe("T-0010");
    expect(getNextTicketId([{ id: "T-9999" }])).toBe("T-10000");
  });
});

describe("parseTicketId", () => {
  test("extracts the numeric portion", () => {
    expect(parseTicketId("T-0042")).toBe(42);
    expect(parseTicketId("abc123def")).toBe(123);
  });

  test("returns 0 for invalid/empty input", () => {
    expect(parseTicketId("")).toBe(0);
    expect(parseTicketId(null)).toBe(0);
    expect(parseTicketId("---")).toBe(0);
    expect(parseTicketId(undefined)).toBe(0);
  });
});

describe("sortTickets", () => {
  const fixtures = [
    { id: "T-0003", owner: "Charlie", status: "In Progress" },
    { id: "T-0001", owner: "Alice", status: "Open" },
    { id: "T-0002", owner: "Bob", status: "Resolved" },
  ];

  test("sorts by numeric id by default", () => {
    const ids = sortTickets(fixtures, "default").map((t) => t.id);
    expect(ids).toEqual(["T-0001", "T-0002", "T-0003"]);
  });

  test("sorts by owner (case-insensitive), then by id", () => {
    const withMixedCase = [
      { id: "T-0001", owner: "alice" },
      { id: "T-0002", owner: "Bob" },
      { id: "T-0003", owner: "Alice" },
    ];
    expect(sortTickets(withMixedCase, "owner").map((t) => t.id)).toEqual([
      "T-0001",
      "T-0003",
      "T-0002",
    ]);
  });

  test("sorts by status order Open < In Progress < Resolved, then by id", () => {
    const ids = sortTickets(fixtures, "status").map((t) => t.id);
    expect(ids).toEqual(["T-0001", "T-0003", "T-0002"]);
  });

  test("places unknown statuses last", () => {
    const withUnknown = [
      { id: "T-0001", status: "Open" },
      { id: "T-0002", status: "Weird" },
    ];
    expect(sortTickets(withUnknown, "status").map((t) => t.id)).toEqual([
      "T-0001",
      "T-0002",
    ]);
  });

  test("does not mutate the input array", () => {
    const input = [{ id: "T-0002" }, { id: "T-0001" }];
    const snapshot = input.map((t) => t.id);
    sortTickets(input, "default");
    expect(input.map((t) => t.id)).toEqual(snapshot);
  });

  test("returns an empty array for empty input", () => {
    expect(sortTickets([], "default")).toEqual([]);
  });
});

describe("filterTickets", () => {
  const tickets = [
    { id: "T-0001", title: "Printer broken" },
    { id: "T-0002", title: "VPN access" },
    { id: "T-0003", title: "printer jam reload" },
  ];

  test("returns all tickets for an empty query", () => {
    expect(filterTickets(tickets, "")).toHaveLength(3);
    expect(filterTickets(tickets)).toHaveLength(3);
  });

  test("filters case-insensitively by substring", () => {
    expect(filterTickets(tickets, "PRINTER").map((t) => t.id)).toEqual(["T-0001", "T-0003"]);
  });

  test("trims surrounding whitespace", () => {
    expect(filterTickets(tickets, "  vpn  ").map((t) => t.id)).toEqual(["T-0002"]);
  });

  test("returns [] when nothing matches", () => {
    expect(filterTickets(tickets, "zzz")).toEqual([]);
  });
});
describe("formatDueDate", () => {
  test("returns the raw value for invalid dates", () => {
    expect(formatDueDate("nope")).toBe("nope");
    expect(formatDueDate("")).toBe("");
  });

  test("returns a localized string for a valid date", () => {
    const out = formatDueDate(new Date(2026, 3, 10).toISOString());
    expect(typeof out).toBe("string");
    expect(out).toContain("2026");
  });
});

describe("toDateInputValue", () => {
  test("returns empty string for empty/invalid input", () => {
    expect(toDateInputValue("")).toBe("");
    expect(toDateInputValue(undefined)).toBe("");
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("not-a-date")).toBe("");
  });

  test("formats a local date as YYYY-MM-DD", () => {
    const ms = new Date(2026, 5, 20).getTime();
    expect(toDateInputValue(ms)).toBe("2026-06-20");
  });

  test("zero-pads month and day", () => {
    const ms = new Date(2026, 0, 7).getTime();
    expect(toDateInputValue(ms)).toBe("2026-01-07");
  });
});

describe("nextTodoId", () => {
  test("returns a UUID when crypto.randomUUID is available", () => {
    const id = nextTodoId([]);
    expect(typeof id).toBe("string");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  test("returns max numeric id + 1 when crypto is unavailable", () => {
    const original = Object.getOwnPropertyDescriptor(global, "crypto");
    Object.defineProperty(global, "crypto", { value: undefined, configurable: true });
    try {
      expect(nextTodoId([])).toBe("1");
      expect(nextTodoId([{ id: "1" }, { id: "3" }, { id: "abc" }])).toBe("4");
    } finally {
      if (original) Object.defineProperty(global, "crypto", original);
      else delete global.crypto;
    }
  });
});

describe("filterTodos", () => {
  const todos = [
    { id: "1", owner: "Alice", completed: false },
    { id: "2", owner: "Bob", completed: true },
    { id: "3", owner: "Alice", completed: true },
  ];

  test("returns all when no filters are applied", () => {
    expect(filterTodos(todos, "", "")).toHaveLength(3);
  });

  test("filters by owner", () => {
    expect(filterTodos(todos, "Alice", "").map((t) => t.id)).toEqual(["1", "3"]);
  });

  test("filters by status open", () => {
    expect(filterTodos(todos, "", "open").map((t) => t.id)).toEqual(["1"]);
  });

  test("filters by status completed", () => {
    expect(filterTodos(todos, "", "completed").map((t) => t.id)).toEqual(["2", "3"]);
  });

  test("filters by owner and status combined", () => {
    expect(filterTodos(todos, "Alice", "completed").map((t) => t.id)).toEqual(["3"]);
  });

  test("returns [] for non-array todos", () => {
    expect(filterTodos(null, "", "")).toEqual([]);
  });
});

describe("groupDocumentsByFirstWord", () => {
  const docs = [
    { name: "Onboarding Resource 1", url: "docs/1.pdf" },
    { name: "Onboarding Resource 2", url: "docs/2.pdf" },
    { name: "Rules and Regulations 1", url: "docs/r1.pdf" },
  ];

  test("groups documents by the first word of their name, in insertion order", () => {
    const groups = groupDocumentsByFirstWord(docs);
    expect([...groups.keys()]).toEqual(["Onboarding", "Rules"]);
    expect(groups.get("Onboarding")).toHaveLength(2);
    expect(groups.get("Rules")).toHaveLength(1);
  });

  test("uses url as fallback and 'Other' when neither is present", () => {
    const withUrl = [{ url: "docs/x.pdf" }];
    const withNothing = [{ name: "" }];
    expect(groupDocumentsByFirstWord(withUrl).get("docs/x.pdf")).toHaveLength(1);
    expect(groupDocumentsByFirstWord(withNothing).get("Other")).toHaveLength(1);
  });

  test("returns an empty Map for empty input", () => {
    expect(groupDocumentsByFirstWord([]).size).toBe(0);
  });
});

describe("contactMatchesQuery", () => {
  const contact = { name: "Alice Chen", role: "Manager", email: "alice@example.com", phone: "555-0100" };

  test("matches on any field, case-insensitively", () => {
    expect(contactMatchesQuery(contact, "alice")).toBe(true);
    expect(contactMatchesQuery(contact, "MANAGER")).toBe(true);
    expect(contactMatchesQuery(contact, "example")).toBe(true);
    expect(contactMatchesQuery(contact, "0100")).toBe(true);
  });

  test("matches everything when the query is empty", () => {
    expect(contactMatchesQuery(contact, "")).toBe(true);
    expect(contactMatchesQuery(contact, "   ")).toBe(true);
  });

  test("returns false when nothing matches", () => {
    expect(contactMatchesQuery(contact, "zzz")).toBe(false);
  });

  test("handles undefined fields gracefully", () => {
    expect(contactMatchesQuery({ name: undefined, role: "IT" }, "zzz")).toBe(false);
    expect(contactMatchesQuery({ name: undefined }, "")).toBe(true);
  });
});
describe("deepEqual", () => {
  test("compares primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
  });

  test("distinguishes types", () => {
    expect(deepEqual("1", 1)).toBe(false);
    expect(deepEqual({}, [])).toBe(false);
  });

  test("compares nested objects regardless of key order", () => {
    expect(deepEqual({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  test("compares arrays in order", () => {
    expect(deepEqual([1, 2, { x: 1 }], [1, 2, { x: 1 }])).toBe(true);
    expect(deepEqual([1, 2], [2, 1])).toBe(false);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  test("compares null vs object", () => {
    expect(deepEqual(null, {})).toBe(false);
    expect(deepEqual({}, null)).toBe(false);
  });
});

describe("refreshSnapshotMatches", () => {
  const snapshot = {
    tickets: [{ id: "T-0001" }],
    todos: [{ id: "1" }],
    onboarding: [{ name: "Onboarding Resource 1" }],
    faq: [{ question: "Q", answer: "A" }],
    contacts: [{ name: "Alice" }],
  };

  test("returns true when the on-disk snapshot matches", () => {
    const onDisk = {
      tickets: [{ id: "T-0001" }],
      todos: [{ id: "1" }],
      onboarding: [{ name: "Onboarding Resource 1" }],
      faq: [{ question: "Q", answer: "A" }],
      contacts: [{ name: "Alice" }],
    };
    expect(refreshSnapshotMatches(snapshot, onDisk)).toBe(true);
  });

  test("returns false when a single field differs", () => {
    const onDisk = { ...snapshot, faq: [{ question: "Q", answer: "Different" }] };
    expect(refreshSnapshotMatches(snapshot, onDisk)).toBe(false);
  });

  test("treats missing arrays as equal empty arrays", () => {
    expect(refreshSnapshotMatches({}, {})).toBe(true);
  });

  test("returns false for differing lengths", () => {
    const onDisk = { ...snapshot, tickets: [] };
    expect(refreshSnapshotMatches(snapshot, onDisk)).toBe(false);
  });
});

describe("module surface", () => {
  test("exports all expected helpers", () => {
    const names = [
      "normalizeComments",
      "normalizeTicket",
      "commentsToTextarea",
      "parseComments",
      "formatTimestamp",
      "getNextTicketId",
      "parseTicketId",
      "sortTickets",
      "filterTickets",
      "formatDueDate",
      "toDateInputValue",
      "nextTodoId",
      "filterTodos",
      "groupDocumentsByFirstWord",
      "contactMatchesQuery",
      "deepEqual",
      "refreshSnapshotMatches",
    ];
    names.forEach((name) => expect(typeof helpers[name]).toBe("function"));
  });
});