// helpers.js
//
// Pure, unit-testable logic extracted from app.js.
//
// These functions are intentionally free of DOM access, event listeners,
// rendering, localStorage, fetch, prompts, and browser File Picker code so they
// can be tested deterministically with Jest. All UI/event/storage/browser code
// remains in app.js.
//
// This file is dual-mode so it can be used in two environments without a
// build step:
//   - Browser: loaded via <script src="helpers.js"> before app.js. The IIFE
//     exposes the helpers on `window.helpers`.
//   - Node/Jest: `require("./helpers.js")` returns the exported object via
//     `module.exports`.
(function () {
  "use strict";

  // ===== Comments parsing / normalization (Ticket Tracker) =====

  // Coerces a ticket's comments into a uniform array of { text, timestamp }.
  // Accepts either plain strings or comment objects; drops null/empty entries.
  const normalizeComments = (comments, fallbackTimestamp) => {
    if (!comments) return [];
    if (Array.isArray(comments)) {
      return comments
        .map((comment) => {
          if (typeof comment === "string") {
            return { text: comment, timestamp: fallbackTimestamp || new Date().toISOString() };
          }
          if (comment && typeof comment === "object" && typeof comment.text === "string") {
            return {
              text: String(comment.text),
              timestamp: comment.timestamp || fallbackTimestamp || new Date().toISOString(),
            };
          }
          return null;
        })
        .filter((comment) => comment && comment.text.length > 0);
    }
    return [];
  };

  // Normalizes a single ticket, attaching normalized comments to it.
  const normalizeTicket = (ticket) => ({
    ...ticket,
    comments: normalizeComments(ticket.comments, ticket.timestamp),
  });

  // Joins comment texts with newlines (used for the edit textarea).
  const commentsToTextarea = (comments) => {
    if (!Array.isArray(comments)) return "";
    return comments.map((comment) => comment.text).join("\n");
  };

  // Converts textarea input into an array of { text, timestamp }, preserving
  // the timestamp of an identical existing comment when found.
  const parseComments = (value, existingComments = []) => {
    const lines = String(value || "")
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return lines.map((text) => {
      const existing = existingComments.find((comment) => comment.text === text);
      return {
        text,
        timestamp: existing?.timestamp || new Date().toISOString(),
      };
    });
  };

  // ===== Ticket sorting / ID generation =====

  // Formats a timestamp for display; returns the raw input when invalid.
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
  };

  // Strips non-digit characters and returns the next "T-####" ticket id.
  const getNextTicketId = (tickets) => {
    const numericIds = tickets
      .map((ticket) => Number.parseInt((ticket.id || "").toString().replace(/\D/g, ""), 10))
      .filter((value) => Number.isFinite(value));

    const maxId = numericIds.length ? Math.max(...numericIds) : 0;
    return `T-${String(maxId + 1).padStart(4, "0")}`;
  };

  const sortStatusOrder = {
    Open: 0,
    "In Progress": 1,
    Resolved: 2,
  };

  // Extracts the numeric portion of a ticket id (e.g. "T-0042" -> 42).
  const parseTicketId = (ticketId) => {
    const numeric = Number.parseInt(String(ticketId || "").replace(/\D/g, ""), 10);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  // Sorts tickets by the given mode ("default" | "owner" | "status"),
  // operating on a copy so the input array is not mutated.
  const sortTickets = (tickets, sortMode) => {
    const copied = [...tickets];

    if (sortMode === "owner") {
      return copied.sort((a, b) => {
        const ownerA = String(a.owner || "").toLowerCase();
        const ownerB = String(b.owner || "").toLowerCase();
        const ownerCompare = ownerA.localeCompare(ownerB);
        if (ownerCompare !== 0) {
          return ownerCompare;
        }
        return parseTicketId(a.id) - parseTicketId(b.id);
      });
    }

    if (sortMode === "status") {
      return copied.sort((a, b) => {
        const statusA = sortStatusOrder[String(a.status || "")] ?? Number.MAX_SAFE_INTEGER;
        const statusB = sortStatusOrder[String(b.status || "")] ?? Number.MAX_SAFE_INTEGER;
        if (statusA !== statusB) {
          return statusA - statusB;
        }
        return parseTicketId(a.id) - parseTicketId(b.id);
      });
    }

    return copied.sort((a, b) => parseTicketId(a.id) - parseTicketId(b.id));
  };

  // Filters tickets by a case-insensitive substring match on their title.
  const filterTickets = (tickets, query) => {
    const q = String(query || "").trim().toLowerCase();
    return q
      ? tickets.filter((ticket) => String(ticket.title || "").toLowerCase().includes(q))
      : tickets;
  };
// ===== Shared To-Do helpers =====

  // Formats a due date for display; returns the raw input when invalid.
  const formatDueDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };

  // Converts an ISO date string to a "YYYY-MM-DD" input value; "" for empty/invalid.
  const toDateInputValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Generates the next todo id. When crypto.randomUUID is available it is used;
  // otherwise the numeric ids are scanned and max+1 is returned.
  const nextTodoId = (todos) => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    const numericIds = (todos || [])
      .map((t) => Number.parseInt(String(t.id || "").replace(/\D/g, ""), 10))
      .filter(Number.isFinite);
    const maxId = numericIds.length ? Math.max(...numericIds) : 0;
    return String(maxId + 1);
  };

  // Filters todos by an owner filter ("") and a status filter
  // ("" | "open" | "completed").
  const filterTodos = (todos, ownerFilter, statusFilter) =>
    (todos || []).filter((t) => {
      if (ownerFilter && (t.owner || "") !== ownerFilter) return false;
      if (statusFilter === "open" && t.completed) return false;
      if (statusFilter === "completed" && !t.completed) return false;
      return true;
    });

  // ===== Onboarding grouping =====

  // Groups onboarding documents by the first word of their name (falling back
  // to their url, then "Other"), preserving insertion order.
  const groupDocumentsByFirstWord = (documents) => {
    const groups = new Map();
    documents.forEach((doc) => {
      const name = String(doc.name || doc.url || "");
      const category = name.trim().split(/\s+/)[0] || "Other";
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category).push(doc);
    });
    return groups;
  };

  // ===== Contacts search =====

  // Returns true when a contact matches a case-insensitive substring query
  // across name, role, email or phone. An empty query matches everything.
  const contactMatchesQuery = (contact, query) => {
    const q = String(query || "").trim().toLowerCase();
    return (
      !q ||
      [contact.name, contact.role, contact.email, contact.phone].some((value) =>
        String(value || "").toLowerCase().includes(q)
      )
    );
  };

  // ===== Sync status comparison =====

  // Recursive deep equality that supports primitives, arrays, nested objects,
  // and object key-order differences.
  const deepEqual = (a, b) => {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object" || a === null || b === null) return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
      if (a.length !== b.length) return false;
      return a.every((item, index) => deepEqual(item, b[index]));
    }
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, index) => key === bKeys[index] && deepEqual(a[key], b[key]));
  };

  // Compares the app's live snapshot against the on-disk data.json snapshot.
  const refreshSnapshotMatches = (snapshot, onDisk) =>
    deepEqual(snapshot.tickets || [], onDisk.tickets || []) &&
    deepEqual(snapshot.todos || [], onDisk.todos || []) &&
    deepEqual(snapshot.onboarding || [], onDisk.onboarding || []) &&
    deepEqual(snapshot.faq || [], onDisk.faq || []) &&
    deepEqual(snapshot.contacts || [], onDisk.contacts || []);

  const helpers = {
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
  };

  // Browser: expose on window so app.js can use it (loaded before app.js).
  if (typeof window === "object" && window !== null) {
    window.helpers = helpers;
  }

  // Node/Jest: CommonJS export so tests can require() the helpers.
  if (typeof module === "object" && module !== null && module.exports) {
    module.exports = helpers;
  }
})();