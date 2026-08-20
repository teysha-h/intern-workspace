# Project progress

## Thu - 6th August 2026
### Completed:
- Defined project objectives
- Set up dev tools     


## Fri - 7th August 2026
### Completed:
- Set up GitHub repository
- Practiced with Git and GitHub Copilot
- Created file structure for project       


## Mon - 10th August 2026
### Completed:
- Define internal deadlines
- Clarify app structure and data.json organization using Copilot
- Build skeleton navigation bar and title on index.html
- Link styles.css to index.html
- Test and commit navigation bar skeleton

### Notes:
#### Recommended app structure from Copilot:
The first version should be a simple static page with a clear dashboard structure and no dynamic logic.

What to include:
- `head`
  - page title
  - link to styles.css
  - optional meta viewport for responsiveness

- `body`
  - top header with app name
  - simple navigation bar with anchors for: dashboard, tickets, to-do, links, onboarding, faq, contacts      


## Tue - 11th August 2026
### Completed tasks:
- Planned, implemented, tested and commited dashboard cards linked to the navbar 
- Implemented the general appearance of the dashboard using styles.css
- Planned, implemented, tested and commited the ITSD ticket tracker section card (Section 8.2)
- Edited the design for the ITSD ticket tracker section card

### Completed sections at this point:
- (8.1) Dashboard
- (8.2) ITSD ticket tracker

### Next steps:
- Complete Section 8.3: Shared to-do
- Create branch for section and test entirely before merging with main      


## Wed - 12th August 2026
### Completed tasks:
- Bug tested ITSD ticket tracker and rest of webpage      


## Thu - 13th August 2026
### Completed tasks:
- Planned, implemented, tested and commited the shared to-do section card and all its features (Section 8.3)
- Implemented the appearance of the shared to-do section and its buttons using styles.css

### Completed sections at this point:
- (8.1) Dashboard
- (8.2) ITSD ticket tracker
- (8.3) Shared to-do    


## Fri - 14th August 2026
### Completed tasks:
- Planned, implemented, tested and commited the important links section card (Section 8.4)
- Debugged styles.css as there were some errors, then commited the changes 

### Completed sections at this point:
- (8.1) Dashboard
- (8.2) ITSD ticket tracker
- (8.3) Shared to-do
- (8.4) Important links      


## Mon - 17th August 2026
### Completed tasks:
- Planned, implemented, tested and commited the onboarding resources section card (Section 8.5)
- Decided that the onboarding documents would group based on the first word of each document
- Debugged the whole page to ensure its running smoothly so far

### Completed sections at this point:
- (8.1) Dashboard
- (8.2) ITSD ticket tracker
- (8.3) Shared to-do
- (8.4) Important links 
- (8.5) Onboarding resources     


## Tue - 18th August 2026
### Completed tasks:
- Edited the formatting of the entire page so each subheading opens up a separate page 
- Planned, implemented, tested and commited the FAQ section card (Section 8.6)
- Planned, implemented, tested and commited the contacts section card (Section 8.7)
- Edited the search bars so it is as-you-type filtering instead of when entered


### Completed sections at this point:
- (8.1) Dashboard
- (8.2) ITSD ticket tracker
- (8.3) Shared to-do
- (8.4) Important links 
- (8.5) Onboarding resources
- (8.6) FAQ
- (8.7) Contacts      


## Thu - 20th August 2026
### Completed tasks:
- Debugged the 'unsynced changes' panel next to the save JSON button
- Tested the functionality and buttons of entire workspace page

### Unit tests (60 in total):

__Comments & ticket parsing__ <br>
1. **`normalizeComments` — falsy values → `[]`** — Passing `null`, `undefined`, or `""` for comments returns an empty array instead of crashing.
2. **`normalizeComments` — plain strings get a fallback timestamp** — If someone stores comments as plain text (e.g. `["hello"]`), each one becomes `{ text: "hello", timestamp: <given fallback> }`.
3. **`normalizeComments` — keeps existing timestamps** — If a comment is already an object with its own time, that time is preserved.
4. **`normalizeComments` — drops bad entries** — Junk entries (`null`, a number, empty object, empty text) are filtered out; only valid text stays.
5. **`normalizeComments` — non-array returns empty** — Feeding it an object (instead of an array) gives `[]`.
6. **`normalizeTicket` — attaches comments, keeps other fields** — A ticket with plain-string comments gets proper `{ text, timestamp }` comments, and its other fields (id, title) are untouched.
7. **`normalizeTicket` — missing comments** — A ticket with no comments still stays valid and gets an empty `comments` array.
8. **`commentsToTextarea` — joins with newlines** — Turns a list of comments into single textarea text `"a\nb\nc"`.
9. **`commentsToTextarea` — non-array** — Returns `""` for `null` or a plain string.
10. **`parseComments` — splits/trims/drops blanks** — Multi-line textarea input becomes separate comment objects, with empty lines removed.
11. **`parseComments` — preserves existing timestamps** — A line matching an already-existing comment keeps that comment's original time; new ones get a current time.
12. **`parseComments` — empty input** — Returns `[]` for `""` or `null`.

__Formatting & ticket IDs__ <br>
13. **`formatTimestamp` — invalid input** — A non-date string is returned unchanged.
14. **`formatTimestamp` — valid date** — A real date produces a readable string containing the year.
15. **`getNextTicketId` — empty list** — Returns `T-0001` when there are no tickets.
16. **`getNextTicketId` — max ID + 1** — With IDs up to `T-0005`, returns `T-0006`.
17. **`getNextTicketId` — ignores junk IDs** — Non-numeric IDs don't affect the result.
18. **`getNextTicketId` — zero-pads** — `T-0009` → `T-0010`; `T-9999` → `T-10000`.
19. **`parseTicketId` — extracts number** — `"T-0042"` → `42`; `"abc123def"` → `123`.
20. **`parseTicketId` — invalid/empty** — Returns `0` for `""`, `null`, `"---"`, `undefined`.

__Sorting & searching tickets__ <br>
21. **`sortTickets` — default order** — Sorts by numeric ID (T-0001, T-0002, T-0003).
22. **`sortTickets` — by owner** — Sorts alphabetically (case-insensitive), ties broken by ID.
23. **`sortTickets` — by status** — Orders `Open < In Progress < Resolved`.
24. **`sortTickets` — unknown status last** — Unrecognised statuses sort after known ones.
25. **`sortTickets` — does not mutate input** — The original array order is unchanged after sorting.
26. **`sortTickets` — empty input** — Returns `[]`.
27. **`filterTickets` — empty query** — Returns all tickets when nothing is typed.
28. **`filterTickets` — case-insensitive match** — `"PRINTER"` matches both `"Printer broken"` and `"printer jam..."`.
29. **`filterTickets` — trims spaces** — Extra spaces around the search term are ignored.
30. **`filterTickets` — no match** — Returns `[]` when nothing matches.

__To-do dates, IDs & filtering__ <br>
31. **`formatDueDate` — invalid** — A bad date string is returned unchanged.
32. **`formatDueDate` — valid** — A real date produces a readable string containing the year.
33. **`toDateInputValue` — empty/invalid** — Returns `""` for `""`, `null`, `undefined`, and non-dates.
34. **`toDateInputValue` — valid date** — Converts to `YYYY-MM-DD` format.
35. **`toDateInputValue` — zero-pads** — `Jan 7 2026` → `2026-01-07`.
36. **`nextTodoId` — uses UUID** — When available, `crypto.randomUUID` produces a standard UUID.
37. **`nextTodoId` — numeric fallback** — Without `crypto`, returns the highest numeric ID + 1 (e.g. `3` → `4`).
38. **`filterTodos` — no filters** — All tasks returned when no owner/status is chosen.
39. **`filterTodos` — by owner** — Only that owner's tasks remain.
40. **`filterTodos` — status open** — Only uncompleted tasks remain.
41. **`filterTodos` — status completed** — Only completed tasks remain.
42. **`filterTodos` — owner + status combined** — Both filters apply together.
43. **`filterTodos` — non-array** — Returns `[]` for `null`.

__Onboarding grouping__ <br>
44. **`groupDocumentsByFirstWord` — groups by first word** — Documents are grouped by prefix (e.g. all "Onboarding…", then all "Rules…") in order.
45. **`groupDocumentsByFirstWord` — fallback name / "Other"** — Uses the URL if no name; falls back to `"Other"` when neither exists.
46. **`groupDocumentsByFirstWord` — empty input** — Returns an empty Map.

__Contacts search__ <br>
47. **`contactMatchesQuery` — matches any field** — Searching name, role, email, or phone all work, case-insensitively.
48. **`contactMatchesQuery` — empty/blank query** — Returns `true` (matches everything).
49. **`contactMatchesQuery` — no match** — Returns `false` when nothing matches.
50. **`contactMatchesQuery` — missing fields** — Handles contacts with undefined fields without crashing.

__Sync-state comparison__ <br>
51. **`deepEqual` — primitives** — Deems `1 == 1` true, `1 == 2` false, `"a" == "a"` true.
52. **`deepEqual` — type differences** — Treats `"1"` and `1` (or `{}` and `[]`) as unequal.
53. **`deepEqual` — nested objects / key order** — Two objects with the same data but keys in different order are equal; different values or extra keys are not.
54. **`deepEqual` — arrays in order** — Arrays compare element-by-element, in order.
55. **`deepEqual` — null vs object** — `null` never equals `{}`.
56. **`refreshSnapshotMatches` — matching snapshots** — Returns `true` when live data and on-disk data match everywhere.
57. **`refreshSnapshotMatches` — single difference** — A difference in just one section (e.g. FAQ) makes it `false`.
58. **`refreshSnapshotMatches` — missing arrays** — Treats missing arrays as equal empty arrays.
59. **`refreshSnapshotMatches` — differing length** — A different ticket count makes it `false`.

__Module integrity__ <br>
60. **exports all expected helpers** — Confirms `helpers.js` exposes every function `app.js` relies on, so the wiring between the two files stays intact.

**Result:** `Test Suites: 1 passed · Tests: 60 passed, 60 total`.

