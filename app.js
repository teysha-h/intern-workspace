document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

  const syncStatusEl = document.getElementById("sync-status");
  const syncJsonBtn = document.getElementById("sync-json-btn");

  let allTickets = [];
  let showForm = false;
  let searchQuery = "";
  let sortMode = "default";
  let writableFileHandle = null;
  let hasUnsyncedChanges = false;
  const storageKey = "intern-workspace-tickets";
  let editingTicketId = null;
  let editingTodoId = null;
  let todoOwnerFilter = "";
  let todoStatusFilter = "";

  // Shared pencil icon used by every "Edit" button. The icon inherits the
  // button's text color via stroke="currentColor".
  const editIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>';

  // Trash icon used by every "Delete" button (matches the Feather icon set of
  // the pencil Edit icon above). It inherits the button's text color via
  // stroke="currentColor".
  const deleteIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

  // Check/tick icon used by every "Mark done" / "Mark open" toggle button
  // (matches the Feather icon set of the pencil Edit and trash Delete icons).
  // It inherits the button's text color via stroke="currentColor".
  const doneIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>';

  // Comment bubble with a "+" glyph used by every "Add comment" button
  // (matches the Feather icon set of the pencil Edit and trash Delete icons).
  // It inherits the button's text color via stroke="currentColor".
  const commentIconSvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>';
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

  const normalizeTicket = (ticket) => ({
    ...ticket,
    comments: normalizeComments(ticket.comments, ticket.timestamp),
  });

  const setSyncStatus = (state, message = "") => {
    if (!syncStatusEl) return;

    const nextClass = state === "synced" ? "sync-badge connected" : "sync-badge reconnect";
    syncStatusEl.className = nextClass;
    syncStatusEl.textContent = message || (state === "synced" ? "All changes synced" : "Unsynced changes");
  };

    const markUnsynced = () => {
    try {
      localStorage.setItem("intern-workspace-unsynced", "true");
    } catch (e) {
      console.warn("Unable to save unsynced status to localStorage", e);
    }
    hasUnsyncedChanges = true;
    setSyncStatus("unsynced", "Unsynced changes");
  };

    const markSynced = () => {
    try {
      localStorage.setItem("intern-workspace-unsynced", "false");
    } catch (e) {
      console.warn("Unable to save unsynced status to localStorage", e);
    }
    hasUnsyncedChanges = false;
    setSyncStatus("synced", "All changes synced");
  };

  const startEditingTicket = (ticketId) => {
    editingTicketId = ticketId;
    renderTickets(allTickets);
  };

  const cancelEditingTicket = () => {
    editingTicketId = null;
    renderTickets(allTickets);
  };

  const saveEditingTicket = async (ticketId, fields) => {
    const { titleInput, ownerInput, statusSelect, commentInputs } = fields;
    if (!titleInput.checkValidity() || !ownerInput.checkValidity() || !statusSelect.checkValidity()) {
      titleInput.reportValidity();
      ownerInput.reportValidity();
      statusSelect.reportValidity();
      return;
    }

    const title = String(titleInput.value || "").trim();
    const owner = String(ownerInput.value || "").trim();
    const status = String(statusSelect.value || "").trim();
    const currentTicket = allTickets.find((ticket) => ticket.id === ticketId);
    // Each comment is edited in its own text box (one box per existing
    // comment). Read them individually: an edited comment gets a fresh
    // timestamp, an untouched comment keeps its original timestamp, and any
    // box that was cleared is dropped entirely.
    const comments = (commentInputs || [])
      .map((input, index) => {
        const text = String(input.value || "").trim();
        if (!text) return null;
        const existing = currentTicket?.comments?.[index];
        return {
          text,
          timestamp: existing && existing.text === text ? existing.timestamp : new Date().toISOString(),
        };
      })
      .filter((comment) => comment !== null);

    if (!title || !owner || !status) {
      return;
    }

    allTickets = allTickets.map((ticket) => {
      if (ticket.id !== ticketId) return ticket;
      return {
        ...ticket,
        title,
        owner,
        status,
        comments,
      };
    });

    saveToLocalStorage(allTickets);
    editingTicketId = null;
    markUnsynced();

    renderTickets(allTickets);
  };

  const deleteTicket = async (ticketId) => {
    allTickets = allTickets.filter((ticket) => ticket.id !== ticketId);
    saveToLocalStorage(allTickets);
    markUnsynced();

    renderTickets(allTickets);
  };

  const saveToLocalStorage = (tickets) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tickets));
    } catch (error) {
      console.warn("Unable to save tickets locally", error);
    }
  };

  const loadFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed.map(normalizeTicket);
        }
      }
    } catch (error) {
      console.warn("Unable to load tickets from local storage", error);
    }
    return null;
  };

  const connectToJsonFile = async () => {
    if (!("showOpenFilePicker" in window)) {
      setSyncStatus("reconnect", "Reconnect");
      return false;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "JSON Files",
            accept: {
              "application/json": [".json"],
            },
          },
        ],
      });

      writableFileHandle = handle;
      return true;
    } catch (error) {
      markUnsynced();
      return false;
    }
  };

  const syncToJsonFile = async () => {
    if (!writableFileHandle) {
      const connected = await connectToJsonFile();
      if (!connected) return;
    }

    try {
      const writable = await writableFileHandle.createWritable();
      const payload = { tickets: allTickets, todos: window._sharedTodos || [], onboarding: onboardingDocuments, faq: faqItems, contacts: contactsItems };
      await writable.write(JSON.stringify(payload, null, 2));
      await writable.close();
      saveToLocalStorage(allTickets);
      try {
        localStorage.setItem("intern-workspace-shared-todos", JSON.stringify({ todos: window._sharedTodos || [] }));
      } catch (e) {
        console.warn("Unable to save todos to localStorage during sync", e);
      }
      markSynced();
    } catch (error) {
      writableFileHandle = null;
      markUnsynced();
    }
  };

  const clearTickets = () => {
    const preserve = ticketsSection.querySelector("h2");
    ticketsSection.innerHTML = "";
    if (preserve) {
      ticketsSection.appendChild(preserve);
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
  };

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

  const parseTicketId = (ticketId) => {
    const numeric = Number.parseInt(String(ticketId || "").replace(/\D/g, ""), 10);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  const sortTickets = (tickets) => {
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

  // ===== Status donut chart (displayed in the Home section card) =====
  // This builds a donut chart for the ticket tracker's status column and
  // shows it in the Home section. It reflects the live ticket tracker
  // automatically: it is re-rendered inside renderTickets(), which is the
  // single refresh path every ticket change (create / edit / change status /
  // delete / add comment) runs through. Counts are actual numbers, not
  // percentages. The same builder is kept reusable if it is ever needed
  // anywhere else.
  const STATUS_CHART_COLORS = {
    Open: "#8a93a3",
    "In Progress": "#f59e0b",
    Resolved: "#22c55e",
  };

  const renderStatusChart = (tickets) => {
    // Always keep every status present (even when its count is zero) so the
    // slices and legend never disappear while the tracker is being used.
    const statuses = ["Open", "In Progress", "Resolved"];
    const counts = statuses.reduce((acc, status) => {
      acc[status] = 0;
      return acc;
    }, {});
    (tickets || []).forEach((ticket) => {
      const status = String(ticket.status || "").trim();
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    const total = statuses.reduce((sum, status) => sum + counts[status], 0);

    const wrap = document.createElement("div");
    wrap.className = "status-chart";

    const donutWrap = document.createElement("div");
    donutWrap.className = "status-chart-donut";

    const svgNs = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNs, "svg");
    svg.setAttribute("viewBox", "0 0 120 120");
    svg.setAttribute("width", "120");
    svg.setAttribute("height", "120");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Tickets by status");

    const cx = 60;
    const cy = 60;
    const r = 45;
    const circumference = 2 * Math.PI * r;

    // Full light-grey track ring that sits underneath the coloured slices.
    const track = document.createElementNS(svgNs, "circle");
    track.setAttribute("cx", cx);
    track.setAttribute("cy", cy);
    track.setAttribute("r", r);
    track.setAttribute("fill", "none");
    track.setAttribute("stroke", "#e2e8f0");
    track.setAttribute("stroke-width", "16");
    svg.appendChild(track);

    if (total > 0) {
      let cumulative = 0;
      statuses.forEach((status) => {
        if (counts[status] === 0) return;
        const length = (counts[status] / total) * circumference;
        const segment = document.createElementNS(svgNs, "circle");
        segment.setAttribute("cx", cx);
        segment.setAttribute("cy", cy);
        segment.setAttribute("r", r);
        segment.setAttribute("fill", "none");
        segment.setAttribute("stroke", STATUS_CHART_COLORS[status]);
        segment.setAttribute("stroke-width", "16");
        segment.setAttribute("stroke-dasharray", `${length} ${circumference - length}`);
        segment.setAttribute("stroke-dashoffset", -cumulative);
        // Start the first slice at the top (12 o'clock) and stack clockwise.
        segment.setAttribute("transform", `rotate(-90 ${cx} ${cy})`);
        svg.appendChild(segment);
        cumulative += length;
      });
    }

    // The hollow middle of the donut shows the total number of tickets.
    const center = document.createElement("div");
    center.className = "status-chart-center";
    const totalText = document.createElement("span");
    totalText.className = "status-chart-center-value";
    totalText.textContent = String(total);
    const totalLabel = document.createElement("span");
    totalLabel.className = "status-chart-center-label";
    totalLabel.textContent = "Tickets";
    center.append(totalText, totalLabel);
    donutWrap.append(svg, center);

    // Legend lists each status with its actual count.
    const legend = document.createElement("ul");
    legend.className = "status-chart-legend";
    statuses.forEach((status) => {
      const item = document.createElement("li");
      item.className = "status-chart-legend-item";
      const swatch = document.createElement("span");
      swatch.className = "status-chart-legend-swatch";
      swatch.style.background = STATUS_CHART_COLORS[status];
      const label = document.createElement("span");
      label.className = "status-chart-legend-label";
      label.textContent = status;
      const value = document.createElement("span");
      value.className = "status-chart-legend-value";
      value.textContent = `${counts[status]}`;
      item.append(swatch, label, value);
      legend.appendChild(item);
    });

    wrap.append(donutWrap, legend);
    return wrap;
  };

  const homeStatusCanvas = document.querySelector("#home-status-chart .home-status-chart-canvas");

  // Draw the donut into the Home section card with the latest ticket statuses.
  // Called from renderTickets() so it refreshes whenever the tracker changes.
  const renderHomeStatusChart = () => {
    if (!homeStatusCanvas) return;
    homeStatusCanvas.innerHTML = "";
    homeStatusCanvas.appendChild(renderStatusChart(allTickets));
  };

  const renderTickets = (tickets) => {
    clearTickets();

    const header = document.createElement("div");
    header.className = "tickets-header";

    const existingTitle = ticketsSection.querySelector("h2");
    if (existingTitle) {
      existingTitle.remove();
      header.appendChild(existingTitle);
    }

    const newTicketButton = document.createElement("button");
    newTicketButton.type = "button";
    newTicketButton.className = "new-ticket-btn";
    newTicketButton.textContent = "New Ticket";
    newTicketButton.addEventListener("click", (event) => {
      event.preventDefault();
      showForm = true;
      renderTickets(allTickets);
    });

    header.appendChild(newTicketButton);
    ticketsSection.appendChild(header);

    // Keep the Home-section status chart in sync with the tracker.
    renderHomeStatusChart();

    const sortForm = document.createElement("form");
    sortForm.className = "tickets-sort";

    const sortLabel = document.createElement("label");
    sortLabel.textContent = "Sort by ";

    const sortSelect = document.createElement("select");
    sortSelect.name = "sortMode";
    [
      { value: "default", label: "Default (ID order)" },
      { value: "owner", label: "Owner" },
      { value: "status", label: "Status" },
    ].forEach((optionData) => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      if (sortMode === optionData.value) {
        option.selected = true;
      }
      sortSelect.appendChild(option);
    });

    sortForm.addEventListener("change", (event) => {
      event.preventDefault();
      const formData = new FormData(sortForm);
      sortMode = String(formData.get("sortMode") || "default");
      renderTickets(allTickets);
    });

    sortLabel.appendChild(sortSelect);
    sortForm.append(sortLabel);
    ticketsSection.appendChild(sortForm);

    const searchForm = document.createElement("form");
    searchForm.className = "tickets-search";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search ticket titles...";
    searchInput.value = searchQuery;
    searchInput.name = "query";

    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(searchForm);
      searchQuery = String(formData.get("query") || "").trim();
      renderTickets(allTickets);
    });

    // As-you-type filtering: update the query on every keystroke and re-render.
    // Because renderTickets rebuilds the whole section, re-focus the freshly
    // re-created input and move the cursor to the end so typing can continue.
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      renderTickets(allTickets);
      const freshInput = ticketsSection.querySelector(".tickets-search input");
      if (freshInput) {
        freshInput.focus();
        freshInput.setSelectionRange(freshInput.value.length, freshInput.value.length);
      }
    });

    searchForm.appendChild(searchInput);
    ticketsSection.appendChild(searchForm);

    if (showForm) {
      const form = document.createElement("form");
      form.className = "ticket-form";
      form.innerHTML = `
        <h3>Create New Ticket</h3>
        <label class="ticket-form-field ticket-form-title">
          Title
          <input name="title" required />
        </label>
        <label class="ticket-form-field ticket-form-owner">
          Owner
          <input name="owner" required />
        </label>
        <label class="ticket-form-field ticket-form-status">
          Status
          <select name="status" required>
            <option value="">Select status</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
          </select>
        </label>
        <label class="ticket-form-field ticket-form-comments">
          Comments
          <textarea name="comments"></textarea>
        </label>
        <div class="ticket-form-actions">
          <button type="submit" class="new-ticket-btn">Add Ticket</button>
          <button type="button" class="new-ticket-btn">Cancel</button>
        </div>
      `;

      form.addEventListener("submit", (event) => {
        event.preventDefault();

        if (!form.reportValidity()) {
          return;
        }

        const formData = new FormData(form);
        const title = String(formData.get("title") || "").trim();
        const owner = String(formData.get("owner") || "").trim();
        const status = String(formData.get("status") || "").trim();
        const commentText = String(formData.get("comments") || "").trim();

        if (!title || !owner || !status) {
          return;
        }

        const newTicket = {
          id: getNextTicketId(allTickets),
          title,
          owner,
          status,
          comments: commentText ? [{ text: commentText, timestamp: new Date().toISOString() }] : [],
          timestamp: new Date().toISOString(),
        };

        allTickets = [...allTickets, newTicket];
        saveToLocalStorage(allTickets);
        markUnsynced();
        showForm = false;
        renderTickets(allTickets);
      });

      const cancelButton = form.querySelector('button[type="button"]');
      cancelButton.addEventListener("click", (event) => {
        event.preventDefault();
        showForm = false;
        renderTickets(allTickets);
      });

      ticketsSection.appendChild(form);
    }

    const query = String(searchQuery || "").trim().toLowerCase();
    const filteredTickets = query
      ? tickets.filter((ticket) => String(ticket.title || "").toLowerCase().includes(query))
      : tickets;

    const visibleTickets = sortTickets(filteredTickets);

    if (visibleTickets.length === 0) {
      const noResults = document.createElement("p");
      noResults.className = "tickets-no-results";
      noResults.textContent = searchQuery
        ? "No tickets match your search query."
        : "No tickets available.";
      ticketsSection.appendChild(noResults);
    }

    const table = document.createElement("table");
    table.className = "ticket-table";

    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
      <th>ID</th>
      <th>Title</th>
      <th>Owner</th>
      <th>Status</th>
      <th>Comments</th>
      <th>Date Created</th>
      <th>Actions</th>
    `;

    const thead = document.createElement("thead");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    visibleTickets.forEach((ticket) => {
      const row = document.createElement("tr");
      const isEditing = editingTicketId === ticket.id;

      const createTextCell = (value) => {
        const cell = document.createElement("td");
        cell.textContent = value;
        return cell;
      };

      if (isEditing) {
        const idCell = createTextCell(ticket.id || "");
        row.appendChild(idCell);

        const titleCell = document.createElement("td");
        const titleInput = document.createElement("input");
        titleInput.name = "title";
        titleInput.required = true;
        titleInput.value = ticket.title || "";
        titleCell.appendChild(titleInput);
        row.appendChild(titleCell);

        const ownerCell = document.createElement("td");
        const ownerInput = document.createElement("input");
        ownerInput.name = "owner";
        ownerInput.required = true;
        ownerInput.value = ticket.owner || "";
        ownerCell.appendChild(ownerInput);
        row.appendChild(ownerCell);

        const statusCell = document.createElement("td");
        const statusSelect = document.createElement("select");
        statusSelect.name = "status";
        statusSelect.required = true;
        ["", "Open", "In Progress", "Resolved"].forEach((statusOption) => {
          const option = document.createElement("option");
          option.value = statusOption;
          option.textContent = statusOption || "Select status";
          if (ticket.status === statusOption) {
            option.selected = true;
          }
          statusSelect.appendChild(option);
        });
        statusCell.appendChild(statusSelect);
        row.appendChild(statusCell);

        const commentsCell = document.createElement("td");
        const commentsContainer = document.createElement("div");
        commentsContainer.className = "ticket-comment-editors";
        // One separate text box per existing comment. There is deliberately no
        // empty "new comment" box, so editing cannot add new comments.
        const commentInputs = (Array.isArray(ticket.comments) ? ticket.comments : []).map(
          (comment) => {
            const commentInput = document.createElement("textarea");
            commentInput.name = "comments";
            commentInput.className = "ticket-comment-editor";
            commentInput.rows = 2;
            commentInput.value = comment.text;
            commentsContainer.appendChild(commentInput);
            return commentInput;
          }
        );
        commentsCell.appendChild(commentsContainer);
        row.appendChild(commentsCell);

        row.appendChild(createTextCell(formatTimestamp(ticket.timestamp)));

        const actionsCell = document.createElement("td");
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "new-ticket-btn ticket-action-btn";
        saveButton.textContent = "Save";
        saveButton.addEventListener("click", async (event) => {
          event.preventDefault();
          await saveEditingTicket(ticket.id, { titleInput, ownerInput, statusSelect, commentInputs });
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "new-ticket-btn ticket-action-btn cancel";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", (event) => {
          event.preventDefault();
          cancelEditingTicket();
        });

        actionsCell.append(saveButton, cancelButton);
        row.appendChild(actionsCell);
      } else {
        row.appendChild(createTextCell(ticket.id || ""));
        row.appendChild(createTextCell(ticket.title || ""));
        row.appendChild(createTextCell(ticket.owner || ""));
        row.appendChild(createTextCell(ticket.status || ""));

        const commentsCell = document.createElement("td");
        const commentsContainer = document.createElement("div");
        commentsContainer.className = "ticket-comments";
        if (Array.isArray(ticket.comments) && ticket.comments.length) {
          ticket.comments.forEach((comment) => {
            const commentLine = document.createElement("div");
            commentLine.className = "ticket-comment-item";
            commentLine.textContent = `${comment.text} (${formatTimestamp(comment.timestamp)})`;
            commentsContainer.appendChild(commentLine);
          });
        }
        commentsCell.appendChild(commentsContainer);
        row.appendChild(commentsCell);

        row.appendChild(createTextCell(formatTimestamp(ticket.timestamp)));

        const actionsCell = document.createElement("td");
        const addCommentButton = document.createElement("button");
        addCommentButton.type = "button";
        addCommentButton.className = "new-ticket-btn ticket-action-btn add-comment-btn";
        addCommentButton.innerHTML = commentIconSvg;
        addCommentButton.setAttribute("aria-label", "Add comment");
        addCommentButton.setAttribute("data-tooltip", "Add comment");
        addCommentButton.addEventListener("click", async (event) => {
          event.preventDefault();
          const commentText = String(prompt("Enter a new comment:") || "").trim();
          if (!commentText) return;

          const newComment = { text: commentText, timestamp: new Date().toISOString() };
          allTickets = allTickets.map((item) => {
            if (item.id !== ticket.id) return item;
            return {
              ...item,
              comments: Array.isArray(item.comments) ? [...item.comments, newComment] : [newComment],
            };
          });

          saveToLocalStorage(allTickets);
          markUnsynced();
          renderTickets(allTickets);
        });

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "new-ticket-btn ticket-action-btn edit-btn";
        editButton.innerHTML = editIconSvg;
        editButton.setAttribute("aria-label", "Edit");
        editButton.setAttribute("data-tooltip", "Edit");
        editButton.addEventListener("click", () => startEditingTicket(ticket.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "new-ticket-btn ticket-action-btn delete-btn";
        deleteButton.innerHTML = deleteIconSvg;
        deleteButton.setAttribute("aria-label", "Delete");
        deleteButton.setAttribute("data-tooltip", "Delete");
        deleteButton.addEventListener("click", async () => {
          if (!confirm("Delete this ticket?")) return;
          await deleteTicket(ticket.id);
        });

        actionsCell.append(addCommentButton, editButton, deleteButton);
        row.appendChild(actionsCell);
      }

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    ticketsSection.appendChild(table);
  };

  if (syncJsonBtn) {
    syncJsonBtn.addEventListener("click", () => {
      syncToJsonFile();
    });
  }

  // Adapted to support `data.json` as either an array (legacy) or an object
  // with shape: { tickets: [...], todos: [...] }.
  const storedTickets = loadFromLocalStorage();
  if (storedTickets !== null) {
    allTickets = storedTickets;
    renderTickets(allTickets);
  }

  // If tickets aren't in localStorage, load from data.json (supports legacy array or new object shape)
  if (storedTickets === null) {
    fetch("data.json")
      .then((response) => {
        if (!response.ok) throw new Error("Network response was not ok");
        return response.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          // legacy: array of tickets
          allTickets = data.map(normalizeTicket);
          // no todos present in legacy file
          window._sharedTodos = window._sharedTodos || [];
        } else if (data && typeof data === "object") {
          allTickets = Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [];
          window._sharedTodos = Array.isArray(data.todos) ? data.todos : window._sharedTodos || [];
          try {
            localStorage.setItem("intern-workspace-shared-todos", JSON.stringify({ todos: window._sharedTodos }));
          } catch (e) {
            console.warn("Unable to persist todos from data.json", e);
          }
        } else {
          allTickets = [];
          window._sharedTodos = window._sharedTodos || [];
        }

        saveToLocalStorage(allTickets);
        renderTickets(allTickets);
        if (typeof renderTodos === "function") renderTodos(window._sharedTodos || []);
      })
      .catch(() => {
        clearTickets();
        const errorMessage = document.createElement("p");
        errorMessage.textContent = "Unable to load ticket data.";
                ticketsSection.appendChild(errorMessage);
      });
  }

  // The "Unsynced changes"/"All changes synced" panel is now decided by
  // `refreshSyncState()` (defined at the end of this file), which compares the
  // current live data against data.json. We no longer restore a stale
  // localStorage flag here, which previously kept showing "Unsynced changes"
  // even after the JSON file had already been updated by Save JSON.

  // Load todos from localStorage if present (local override)
  const todoStorageKey = "intern-workspace-shared-todos";
  const loadTodosFromLocalStorage = () => {
    try {
      const raw = localStorage.getItem(todoStorageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.todos)) return parsed.todos;
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      console.warn("Unable to load todos from localStorage", e);
    }
    return null;
  };

  const saveTodosToLocalStorage = (todos) => {
    try {
      localStorage.setItem(todoStorageKey, JSON.stringify({ todos }));
    } catch (e) {
      console.warn("Unable to save todos to localStorage", e);
    }
  };

  const formatDueDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };

  const toDateInputValue = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

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

  const todoSection = document.getElementById("todo");

  const renderTodos = (todos) => {
    if (!todoSection) return;
    const preserve = todoSection.querySelector("h2");
    todoSection.innerHTML = "";
    if (preserve) todoSection.appendChild(preserve);

    const container = document.createElement("div");
    container.className = "todo-container";

    if (!Array.isArray(todos) || todos.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No shared tasks yet.";
      container.appendChild(empty);
    } else {
      // Filter controls
      const filterBar = document.createElement("div");
      filterBar.className = "todo-filters";

      const ownerLabel = document.createElement("label");
      ownerLabel.textContent = "Owner ";
      const ownerSelect = document.createElement("select");
      ownerSelect.name = "todoOwnerFilter";
      const owners = [...new Set((todos || []).map((t) => t.owner || "").filter(Boolean))].sort();
      const ownerOptions = [{ value: "", label: "All owners" }, ...owners.map((o) => ({ value: o, label: o }))];
      ownerOptions.forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (todoOwnerFilter === opt.value) option.selected = true;
        ownerSelect.appendChild(option);
      });
      ownerSelect.addEventListener("change", () => {
        todoOwnerFilter = ownerSelect.value;
        renderTodos(todos);
      });
      ownerLabel.appendChild(ownerSelect);
      filterBar.appendChild(ownerLabel);

      const statusLabel = document.createElement("label");
      statusLabel.textContent = "Status ";
      const statusSelect = document.createElement("select");
      statusSelect.name = "todoStatusFilter";
      [
        { value: "", label: "All statuses" },
        { value: "open", label: "Open" },
        { value: "completed", label: "Completed" },
      ].forEach((opt) => {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        if (todoStatusFilter === opt.value) option.selected = true;
        statusSelect.appendChild(option);
      });
      statusSelect.addEventListener("change", () => {
        todoStatusFilter = statusSelect.value;
        renderTodos(todos);
      });
      statusLabel.appendChild(statusSelect);
      filterBar.appendChild(statusLabel);

      container.appendChild(filterBar);

      // Apply filters
      const filteredTodos = (todos || []).filter((t) => {
        if (todoOwnerFilter && (t.owner || "") !== todoOwnerFilter) return false;
        if (todoStatusFilter === "open" && t.completed) return false;
        if (todoStatusFilter === "completed" && !t.completed) return false;
        return true;
      });

      if (filteredTodos.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No shared tasks match the current filters.";
        container.appendChild(empty);
      } else {
        const list = document.createElement("ul");
        list.className = "todo-list";
        filteredTodos.forEach((t) => {
          const li = document.createElement("li");
          li.className = "todo-item";
          const isEditing = editingTodoId === t.id;

          const actions = document.createElement("div");
          actions.className = "todo-actions";

          if (isEditing) {
            const fields = document.createElement("div");
            fields.className = "todo-edit-fields";

            const taskInput = document.createElement("input");
            taskInput.name = "task";
            taskInput.placeholder = "Task";
            taskInput.value = t.task || "";

            const ownerInput = document.createElement("input");
            ownerInput.name = "owner";
            ownerInput.placeholder = "Owner";
            ownerInput.value = t.owner || "";

            const dueDateInput = document.createElement("input");
            dueDateInput.name = "dueDate";
            dueDateInput.type = "date";
            dueDateInput.value = toDateInputValue(t.dueDate);

            fields.append(taskInput, ownerInput, dueDateInput);

            const saveButton = document.createElement("button");
            saveButton.type = "button";
            saveButton.textContent = "Save";
            saveButton.addEventListener("click", () => {
              const task = String(taskInput.value || "").trim();
              const owner = String(ownerInput.value || "").trim();
              if (!task || !owner) return;
              const dueIso = dueDateInput.value ? new Date(dueDateInput.value).toISOString() : "";
              t.task = task;
              t.owner = owner;
              t.dueDate = dueIso;
              editingTodoId = null;
              saveTodosToLocalStorage(todos);
              markUnsynced();
              renderTodos(todos);
            });

            const cancelButton = document.createElement("button");
            cancelButton.type = "button";
            cancelButton.textContent = "Cancel";
            cancelButton.addEventListener("click", () => {
              editingTodoId = null;
              renderTodos(todos);
            });

            actions.append(saveButton, cancelButton);
            li.append(actions, fields);
          } else {
            const label = document.createElement("div");
            label.className = "todo-label";
            label.textContent = t.task || "";

            const meta = document.createElement("div");
            meta.className = "todo-meta";
            meta.textContent = `${t.owner || ""} • due ${formatDueDate(t.dueDate || "")}`;

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "todo-done-btn done-btn";
            toggle.innerHTML = doneIconSvg;
            toggle.setAttribute("aria-label", t.completed ? "Mark open" : "Mark done");
            toggle.setAttribute("data-tooltip", t.completed ? "Mark open" : "Mark done");
            toggle.addEventListener("click", () => {
              t.completed = !t.completed;
              saveTodosToLocalStorage(todos);
              markUnsynced();
              renderTodos(todos);
            });

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.className = "edit-btn";
            editButton.innerHTML = editIconSvg;
            editButton.setAttribute("aria-label", "Edit");
            editButton.setAttribute("data-tooltip", "Edit");
            editButton.addEventListener("click", () => {
              editingTodoId = t.id;
              renderTodos(todos);
            });

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "delete-btn";
            remove.innerHTML = deleteIconSvg;
            remove.setAttribute("aria-label", "Delete");
            remove.setAttribute("data-tooltip", "Delete");
            remove.addEventListener("click", () => {
              if (!confirm("Delete this task?")) return;
              const idx = todos.findIndex((item) => item.id === t.id);
              if (idx >= 0) {
                todos.splice(idx, 1);
                saveTodosToLocalStorage(todos);
                markUnsynced();
                renderTodos(todos);
              }
            });

            actions.append(toggle, editButton, remove);
            li.append(label, meta, actions);
            if (t.completed) li.classList.add("completed");
          }

          list.appendChild(li);
        });
        container.appendChild(list);
      }
    }

    const form = document.createElement("form");
    form.className = "todo-form";
    form.innerHTML = `
      <h3>Add shared task</h3>
      <label>Task<input name="task" required /></label>
      <label>Owner<input name="owner" required /></label>
      <label>Due date<input name="dueDate" type="date" /></label>
      <div class="todo-form-actions">
        <button type="submit" class="new-ticket-btn">Add</button>
      </div>
    `;

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const task = String(fd.get("task") || "").trim();
      const owner = String(fd.get("owner") || "").trim();
      const dueDateInput = String(fd.get("dueDate") || "").trim();
      if (!task || !owner) return;
      const todosList = Array.isArray(window._sharedTodos) ? window._sharedTodos : [];
      const id = nextTodoId(todosList);
      const dueIso = dueDateInput ? new Date(dueDateInput).toISOString() : "";
      const newTodo = { id, task, owner, dueDate: dueIso, completed: false, createdAt: new Date().toISOString() };
      todosList.push(newTodo);
      window._sharedTodos = todosList;
      saveTodosToLocalStorage(todosList);
      markUnsynced();
      renderTodos(todosList);
      form.reset();
    });

    container.appendChild(form);
    todoSection.appendChild(container);
  };

  // Initialize todos: prefer localStorage, then data.json, else empty
  (function initTodos() {
    if (!todoSection) return;
    const local = loadTodosFromLocalStorage();
    if (local !== null) {
      window._sharedTodos = local;
      renderTodos(local);
      return;
    }
    // fallback: try fetching data.json if tickets were not already loaded from it
    fetch("data.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) {
          window._sharedTodos = [];
          renderTodos([]);
          return;
        }
        if (Array.isArray(data)) {
          // legacy array-only file: tickets already handled above when not in localStorage
          window._sharedTodos = [];
          renderTodos([]);
          return;
        }
        // object shape
        window._sharedTodos = Array.isArray(data.todos) ? data.todos : [];
        saveTodosToLocalStorage(window._sharedTodos);
        renderTodos(window._sharedTodos);
      })
      .catch(() => {
        window._sharedTodos = [];
        renderTodos([]);
      });
  })();

  // ===== Important Links =====
  const linksSection = document.getElementById("links");
  const linksContainer = linksSection ? linksSection.querySelector(".links-container") : null;
  const linksStorageKey = "intern-workspace-links";
  let linksData = [
    {
      category: "Internal Tools",
      links: [
        { name: "GitHub", url: "https://github.com" },
        { name: "Google Drive", url: "https://drive.google.com" },
        { name: "Slack", url: "https://slack.com" },
        { name: "Email", url: "https://mail.google.com" },
      ],
    },
    {
      category: "Documentation",
      links: [
        { name: "MDN Web Docs", url: "https://developer.mozilla.org" },
        { name: "W3Schools", url: "https://www.w3schools.com" },
        { name: "Stack Overflow", url: "https://stackoverflow.com" },
      ],
    },
    {
      category: "Support",
      links: [
        { name: "IT Help Desk", url: "https://support.google.com" },
        { name: "HR Portal", url: "https://www.microsoft.com" },
      ],
    },
  ];
  let editingLink = null; // { categoryIndex, linkIndex }
  let writableHtmlHandle = null;

  const saveLinksToLocalStorage = () => {
    try {
      localStorage.setItem(linksStorageKey, JSON.stringify(linksData));
    } catch (error) {
      console.warn("Unable to save links locally", error);
    }
  };

  const loadLinksFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(linksStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Unable to load links from local storage", error);
    }
    return null;
  };

  const connectToHtmlFile = async () => {
    if (!("showOpenFilePicker" in window)) {
      setSyncStatus("reconnect", "Reconnect");
      return false;
    }

    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "HTML Files",
            accept: {
              "text/html": [".html"],
            },
          },
        ],
      });

      writableHtmlHandle = handle;
      return true;
    } catch (error) {
      markUnsynced();
      return false;
    }
  };

  const writeLinksToHtml = async () => {
    if (!writableHtmlHandle) {
      const connected = await connectToHtmlFile();
      if (!connected) return;
    }

    try {
      const file = await writableHtmlHandle.getFile();
      const text = await file.text();

      // Build the links HTML that should live inside the #links section
      const linksHtml = linksData
        .map(
          (category) => `
          <div class="link-category">
            <h3>${category.category}</h3>
            <div class="link-list">
              ${category.links
                .map(
                  (link) => `
                <div class="link-item">
                  <a href="${link.url}" target="_blank" rel="noopener noreferrer">${link.name}</a>
                </div>`
                )
                .join("")}
            </div>
          </div>`
        )
        .join("");

      const sectionStart = text.indexOf('<section id="links">');
      const sectionEnd = text.indexOf("</section>", sectionStart);
      if (sectionStart === -1 || sectionEnd === -1) {
        throw new Error("Could not locate the links section in index.html");
      }

      const updatedText =
        text.slice(0, sectionStart) +
        `<section id="links">\n        <h2>Important Links</h2>\n        <div class="links-container">${linksHtml}\n        </div>\n      </section>` +
        text.slice(sectionEnd + "</section>".length);

      const writable = await writableHtmlHandle.createWritable();
      await writable.write(updatedText);
      await writable.close();
      markSynced();
    } catch (error) {
      writableHtmlHandle = null;
      markUnsynced();
    }
  };

  const renderLinks = () => {
    if (!linksSection || !linksContainer) return;

    const preserve = linksSection.querySelector("h2");
    linksSection.innerHTML = "";
    if (preserve) linksSection.appendChild(preserve);

    const container = document.createElement("div");
    container.className = "links-container";

    linksData.forEach((category, categoryIndex) => {
      const categoryDiv = document.createElement("div");
      categoryDiv.className = "link-category";

      const heading = document.createElement("h3");
      heading.textContent = category.category;
      categoryDiv.appendChild(heading);

      const list = document.createElement("div");
      list.className = "link-list";

      category.links.forEach((link, linkIndex) => {
        const isEditing =
          editingLink && editingLink.categoryIndex === categoryIndex && editingLink.linkIndex === linkIndex;

        if (isEditing) {
          const form = document.createElement("form");
          form.className = "link-edit-form";

          const nameLabel = document.createElement("label");
          nameLabel.textContent = "Link Name";
          const nameInput = document.createElement("input");
          nameInput.name = "name";
          nameInput.required = true;
          nameInput.value = link.name || "";
          nameLabel.appendChild(nameInput);

          const urlLabel = document.createElement("label");
          urlLabel.textContent = "URL";
          const urlInput = document.createElement("input");
          urlInput.name = "url";
          urlInput.type = "url";
          urlInput.required = true;
          urlInput.value = link.url || "";
          urlLabel.appendChild(urlInput);

          const actions = document.createElement("div");
          actions.className = "link-edit-actions";

          const saveButton = document.createElement("button");
          saveButton.type = "submit";
          saveButton.className = "new-ticket-btn";
          saveButton.textContent = "Save";
          saveButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const name = String(nameInput.value || "").trim();
            const url = String(urlInput.value || "").trim();
            if (!name || !url) return;
            linksData[categoryIndex].links[linkIndex] = { name, url };
            editingLink = null;
            saveLinksToLocalStorage();
            markUnsynced();
            renderLinks();
            writeLinksToHtml();
          });

          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "new-ticket-btn";
          cancelButton.textContent = "Cancel";
          cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingLink = null;
            renderLinks();
          });

          actions.append(saveButton, cancelButton);
          form.append(nameLabel, urlLabel, actions);
          list.appendChild(form);
        } else {
          const item = document.createElement("div");
          item.className = "link-item";

          const anchor = document.createElement("a");
          anchor.href = link.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = link.name;
          item.appendChild(anchor);

          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "new-ticket-btn edit-btn";
          editButton.innerHTML = editIconSvg;
          editButton.setAttribute("aria-label", "Edit");
          editButton.setAttribute("data-tooltip", "Edit");
          editButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingLink = { categoryIndex, linkIndex };
            renderLinks();
          });

          item.appendChild(editButton);
          list.appendChild(item);
        }
      });

      categoryDiv.appendChild(list);
      container.appendChild(categoryDiv);
    });

    linksSection.appendChild(container);
  };

  // Initialize links: prefer localStorage, then default data
  (function initLinks() {
    if (!linksSection) return;
    const local = loadLinksFromLocalStorage();
    if (local !== null) {
      linksData = local;
    }
    renderLinks();
  })();

  // ===== Onboarding Resources =====
  const onboardingSection = document.getElementById("onboarding");
  const onboardingStorageKey = "intern-workspace-onboarding";
  let onboardingDocuments = [
    { name: "Onboarding Resource 1", url: "docs/Onboarding resource 1.pdf" },
    { name: "Onboarding Resource 2", url: "docs/Onboarding resource 2.pdf" },
    { name: "Onboarding Resource 3", url: "docs/Onboarding resource 3.pdf" },
    { name: "Rules and Regulations 1", url: "docs/Rules and regulations 1.pdf" },
    { name: "Rules and Regulations 2", url: "docs/Rules and regulations 2.pdf" },
  ];

  const saveOnboardingToLocalStorage = () => {
    try {
      localStorage.setItem(onboardingStorageKey, JSON.stringify(onboardingDocuments));
    } catch (error) {
      console.warn("Unable to save onboarding documents locally", error);
    }
  };

  const loadOnboardingFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(onboardingStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Unable to load onboarding documents from local storage", error);
    }
    return null;
  };

  const renderOnboarding = () => {
    if (!onboardingSection) return;

    const preserve = onboardingSection.querySelector("h2");
    onboardingSection.innerHTML = "";
    if (preserve) onboardingSection.appendChild(preserve);

    const container = document.createElement("div");
    container.className = "onboarding-documents";

    if (!Array.isArray(onboardingDocuments) || onboardingDocuments.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No onboarding resources yet.";
      container.appendChild(empty);
    } else {
      const groups = new Map();
      onboardingDocuments.forEach((doc) => {
        const name = String(doc.name || doc.url || "");
        const category = name.trim().split(/\s+/)[0] || "Other";
        if (!groups.has(category)) {
          groups.set(category, []);
        }
        groups.get(category).push(doc);
      });

      groups.forEach((docs, category) => {
        const heading = document.createElement("h3");
        heading.textContent = category;
        container.appendChild(heading);

        docs.forEach((doc) => {
          const item = document.createElement("div");
          item.className = "onboarding-doc-item";

          const anchor = document.createElement("a");
          anchor.href = doc.url;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          anchor.textContent = doc.name || doc.url;
          item.appendChild(anchor);

          container.appendChild(item);
        });
      });
    }

    onboardingSection.appendChild(container);
  };

  // Initialize onboarding: prefer localStorage, then data.json, else defaults
  (function initOnboarding() {
    if (!onboardingSection) return;
    const local = loadOnboardingFromLocalStorage();
    if (local !== null) {
      onboardingDocuments = local;
      renderOnboarding();
      return;
    }
    fetch("data.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.onboarding)) {
          onboardingDocuments = data.onboarding;
          saveOnboardingToLocalStorage();
        }
        renderOnboarding();
      })
      .catch(() => {
        renderOnboarding();
      });
  })();

  // ===== FAQ =====
  // FAQ data lives in data.json and is mirrored here as a fallback so the
  // "Save JSON" sync always persists it. The FAQ section renders each
  // question together with its answer inside the FAQ card.
  const faqSection = document.getElementById("faq");
  let faqItems = [
    { question: "How do I submit an IT support ticket?", answer: "Go to the Ticket Tracker section and use the form to create a new ticket. Include a clear title and describe the issue so the support team can help you quickly." },
    { question: "Where can I find the onboarding resources?", answer: "Open the Onboarding section from the navigation bar. All documents are listed there and open in a new tab when clicked." },
    { question: "What should I do if my computer is not working?", answer: "Create a ticket in the Ticket Tracker with the details of the problem. You can also reach the IT help desk through the Support links in the Important Links section." },
    { question: "How do I reset my password?", answer: "Contact the IT Service Desk. You can find the IT Help Desk link under Support in the Important Links section." },
    { question: "Where can I find the company rules and regulations?", answer: "They are available in the Onboarding section under Rules and Regulations. Click a document to open it in a new tab." },
  ];

  // Persists edited FAQ items locally so edits survive page reloads while the
  // "Save JSON" sync can still push them into the connected data.json file.
  const faqStorageKey = "intern-workspace-faq";
  let editingFaqIndex = null;

  const saveFaqToLocalStorage = () => {
    try {
      localStorage.setItem(faqStorageKey, JSON.stringify(faqItems));
    } catch (error) {
      console.warn("Unable to save FAQ items locally", error);
    }
  };

  const loadFaqFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(faqStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Unable to load FAQ items from local storage", error);
    }
    return null;
  };

  // Toggles the collapsed/expanded state of a single FAQ answer. The "open"
  // class on the item drives the CSS (answer hidden/shown, chevron rotated)
  // and aria-expanded is kept in sync for assistive technology.
  const toggleFaqAnswer = (entry) => {
    const open = entry.classList.toggle("open");
    const question = entry.querySelector(".faq-question");
    if (question) question.setAttribute("aria-expanded", String(open));
  };

  const renderFaq = () => {
    if (!faqSection) return;

    const preserve = faqSection.querySelector("h2");
    faqSection.innerHTML = "";
    if (preserve) faqSection.appendChild(preserve);

    const container = document.createElement("div");
    container.className = "faq-list";

    if (!Array.isArray(faqItems) || faqItems.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No FAQ items yet.";
      container.appendChild(empty);
    } else {
      faqItems.forEach((item, itemIndex) => {
        const entry = document.createElement("div");
        entry.className = "faq-item faq-item--collapsible";

        // Edit mode: swap the read-only question/answer for an inline form,
        // mirroring the editing pattern used by the Important Links card.
        if (editingFaqIndex === itemIndex) {
          entry.classList.add("faq-item--editing");

          const form = document.createElement("form");
          form.className = "faq-edit-form";

          const questionLabel = document.createElement("label");
          questionLabel.textContent = "Question";
          const questionInput = document.createElement("input");
          questionInput.name = "question";
          questionInput.required = true;
          questionInput.value = item.question || "";
          questionLabel.appendChild(questionInput);

          const answerLabel = document.createElement("label");
          answerLabel.textContent = "Answer";
          const answerInput = document.createElement("textarea");
          answerInput.name = "answer";
          answerInput.required = true;
          answerInput.value = item.answer || "";
          answerLabel.appendChild(answerInput);

          const actions = document.createElement("div");
          actions.className = "faq-edit-actions";

          const saveButton = document.createElement("button");
          saveButton.type = "submit";
          saveButton.className = "new-ticket-btn";
          saveButton.textContent = "Save";
          saveButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const question = String(questionInput.value || "").trim();
            const answer = String(answerInput.value || "").trim();
            if (!question || !answer) return;
            faqItems[itemIndex] = { question, answer };
            editingFaqIndex = null;
            saveFaqToLocalStorage();
            markUnsynced();
            renderFaq();
          });

          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "new-ticket-btn";
          cancelButton.textContent = "Cancel";
          cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingFaqIndex = null;
            renderFaq();
          });

          actions.append(saveButton, cancelButton);
          form.append(questionLabel, answerLabel, actions);
          entry.appendChild(form);
        } else {
          const questionRow = document.createElement("div");
          questionRow.className = "faq-question-row";

          const question = document.createElement("h3");
          question.className = "faq-question";
          question.textContent = item.question || "";

          // Collapsible answers: each answer stays hidden until its question
          // is activated. Clicking (or pressing Enter/Space while focused)
          // expands and collapses the answer. The Edit button lives next to
          // the question but outside it, so clicking Edit never toggles the
          // answer open or closed.
          question.setAttribute("role", "button");
          question.setAttribute("tabindex", "0");
          question.setAttribute("aria-expanded", "false");
          question.addEventListener("click", () => toggleFaqAnswer(entry));
          question.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleFaqAnswer(entry);
            }
          });

          const actions = document.createElement("div");
          actions.className = "faq-item-actions";

          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "new-ticket-btn edit-btn";
          editButton.innerHTML = editIconSvg;
          editButton.setAttribute("aria-label", "Edit");
          editButton.setAttribute("data-tooltip", "Edit");
          editButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingFaqIndex = itemIndex;
            renderFaq();
          });

          const deleteButton = document.createElement("button");
          deleteButton.type = "button";
          deleteButton.className = "new-ticket-btn delete-btn";
          deleteButton.innerHTML = deleteIconSvg;
          deleteButton.setAttribute("aria-label", "Delete");
          deleteButton.setAttribute("data-tooltip", "Delete");
          deleteButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!confirm("Delete this FAQ item?")) return;
            faqItems.splice(itemIndex, 1);
            editingFaqIndex = null;
            saveFaqToLocalStorage();
            markUnsynced();
            renderFaq();
          });

          actions.append(editButton, deleteButton);
          questionRow.append(question, actions);

          const answer = document.createElement("p");
          answer.className = "faq-answer";
          answer.textContent = item.answer || "";

          entry.append(questionRow, answer);
        }

        container.appendChild(entry);
      });
    }

    faqSection.appendChild(container);
  };

  // Initialize FAQ: prefer localStorage (edited items persist), then data.json,
  // else the built-in defaults above.
  (function initFaq() {
    if (!faqSection) return;
    const local = loadFaqFromLocalStorage();
    if (local !== null) {
      faqItems = local;
      renderFaq();
      return;
    }
    fetch("data.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.faq)) {
          faqItems = data.faq;
          saveFaqToLocalStorage();
        }
        renderFaq();
      })
      .catch(() => {
        renderFaq();
      });
  })();

  // ===== Contacts =====
  // Contact data lives in data.json and is mirrored here as a fallback so the
  // "Save JSON" sync always persists it. The Contacts section renders each
  // person with their role, email and phone inside the Contacts card.
  const contactsSection = document.getElementById("contacts");
  let contactsItems = [
    { name: "Peter Smith", role: "IT Service Desk", email: "peter.smith@example.com", phone: "555-0100" },
    { name: "Lily Jones", role: "HR", email: "lily.jones@example.com", phone: "555-0101" },
    { name: "Sarah Chen", role: "Intern", email: "sarah.chen@example.com", phone: "555-0102" },
  ];

  const contactsStorageKey = "intern-workspace-contacts";
  let editingContactIndex = null;
  let contactSearchQuery = "";

  const saveContactsToLocalStorage = () => {
    try {
      localStorage.setItem(contactsStorageKey, JSON.stringify(contactsItems));
    } catch (error) {
      console.warn("Unable to save contacts locally", error);
    }
  };

  const loadContactsFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(contactsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn("Unable to load contacts from local storage", error);
    }
    return null;
  };

  const renderContacts = () => {
    if (!contactsSection) return;

    const preserve = contactsSection.querySelector("h2");
    contactsSection.innerHTML = "";
    if (preserve) contactsSection.appendChild(preserve);

    // Search bar: mirrors the Ticket Tracker's search pattern. The query is
    // stored in contactSearchQuery so it persists across re-renders.
    const searchForm = document.createElement("form");
    searchForm.className = "contacts-search";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.placeholder = "Search contacts by name, role, email or phone...";
    searchInput.value = contactSearchQuery;
    searchInput.name = "query";

    searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(searchForm);
      contactSearchQuery = String(formData.get("query") || "").trim();
      renderContacts();
    });

    // As-you-type filtering: update the query on every keystroke and re-render.
    // Because renderContacts rebuilds the whole section, re-focus the freshly
    // re-created input and move the cursor to the end so typing can continue.
    searchInput.addEventListener("input", () => {
      contactSearchQuery = searchInput.value;
      renderContacts();
      const freshInput = contactsSection.querySelector(".contacts-search input");
      if (freshInput) {
        freshInput.focus();
        freshInput.setSelectionRange(freshInput.value.length, freshInput.value.length);
      }
    });

    searchForm.appendChild(searchInput);
    contactsSection.appendChild(searchForm);

    const query = String(contactSearchQuery || "").trim().toLowerCase();
    const matchesQuery = (contact) =>
      !query ||
      [contact.name, contact.role, contact.email, contact.phone].some((value) =>
        String(value || "").toLowerCase().includes(query)
      );

    const container = document.createElement("div");
    container.className = "contacts-list";

    if (!Array.isArray(contactsItems) || contactsItems.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No contacts yet.";
      container.appendChild(empty);
    } else {
      let matchCount = 0;
      contactsItems.forEach((contact, contactIndex) => {
        // Skip filtered-out contacts while keeping the original contactIndex,
        // so the Edit action keeps targeting the right item in contactsItems
        // even while the list is filtered.
        if (!matchesQuery(contact)) return;
        matchCount += 1;
        const item = document.createElement("div");
        item.className = "contact-item";

        // Edit mode: swap the read-only details for an inline form, mirroring
        // the inline editing pattern used by the FAQ and Important Links cards.
        if (editingContactIndex === contactIndex) {
          item.classList.add("contact-item--editing");

          const form = document.createElement("form");
          form.className = "contact-edit-form";

          const nameLabel = document.createElement("label");
          nameLabel.textContent = "Name";
          const nameInput = document.createElement("input");
          nameInput.name = "name";
          nameInput.required = true;
          nameInput.value = contact.name || "";
          nameLabel.appendChild(nameInput);

          const roleLabel = document.createElement("label");
          roleLabel.textContent = "Role";
          const roleInput = document.createElement("input");
          roleInput.name = "role";
          roleInput.value = contact.role || "";
          roleLabel.appendChild(roleInput);

          const emailLabel = document.createElement("label");
          emailLabel.textContent = "Email";
          const emailInput = document.createElement("input");
          emailInput.name = "email";
          emailInput.type = "email";
          emailInput.value = contact.email || "";
          emailLabel.appendChild(emailInput);

          const phoneLabel = document.createElement("label");
          phoneLabel.textContent = "Phone";
          const phoneInput = document.createElement("input");
          phoneInput.name = "phone";
          phoneInput.type = "tel";
          phoneInput.value = contact.phone || "";
          phoneLabel.appendChild(phoneInput);

          const actions = document.createElement("div");
          actions.className = "contact-edit-actions";

          const saveButton = document.createElement("button");
          saveButton.type = "submit";
          saveButton.className = "new-ticket-btn";
          saveButton.textContent = "Save";
          saveButton.addEventListener("click", (event) => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const name = String(nameInput.value || "").trim();
            if (!name) return;
            const role = String(roleInput.value || "").trim();
            const email = String(emailInput.value || "").trim();
            const phone = String(phoneInput.value || "").trim();
            contactsItems[contactIndex] = { name, role, email, phone };
            editingContactIndex = null;
            saveContactsToLocalStorage();
            markUnsynced();
            renderContacts();
          });

          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "new-ticket-btn";
          cancelButton.textContent = "Cancel";
          cancelButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingContactIndex = null;
            renderContacts();
          });

          actions.append(saveButton, cancelButton);
          form.append(nameLabel, roleLabel, emailLabel, phoneLabel, actions);
          item.appendChild(form);
        } else {
          const header = document.createElement("div");
          header.className = "contact-header";

          const name = document.createElement("h3");
          name.textContent = contact.name || "";

          const actions = document.createElement("div");
          actions.className = "contact-item-actions";

          const editButton = document.createElement("button");
          editButton.type = "button";
          editButton.className = "new-ticket-btn edit-btn";
          editButton.innerHTML = editIconSvg;
          editButton.setAttribute("aria-label", "Edit");
          editButton.setAttribute("data-tooltip", "Edit");
          editButton.addEventListener("click", (event) => {
            event.preventDefault();
            editingContactIndex = contactIndex;
            renderContacts();
          });

          actions.appendChild(editButton);
          header.append(name, actions);
          item.appendChild(header);

          const role = document.createElement("p");
          role.className = "contact-role";
          role.textContent = contact.role || "";
          item.appendChild(role);

          const details = document.createElement("div");
          details.className = "contact-details";

          if (contact.email) {
            const emailLink = document.createElement("a");
            emailLink.href = `mailto:${contact.email}`;
            emailLink.textContent = contact.email;
            details.appendChild(emailLink);
          }

          if (contact.phone) {
            const phoneLink = document.createElement("a");
            phoneLink.href = `tel:${contact.phone}`;
            phoneLink.textContent = contact.phone;
            details.appendChild(phoneLink);
          }

          item.appendChild(details);
        }

        container.appendChild(item);
      });

      // Show a distinct message when contacts exist but none match the search.
      if (matchCount === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No contacts match your search query.";
        container.appendChild(empty);
      }
    }

    contactsSection.appendChild(container);
  };

  // Initialize Contacts: prefer localStorage (edits/refresh persist), then
  // data.json, else the built-in defaults above.
  (function initContacts() {
    if (!contactsSection) return;
    const local = loadContactsFromLocalStorage();
    if (local !== null) {
      contactsItems = local;
      renderContacts();
      return;
    }
    fetch("data.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.contacts)) {
          contactsItems = data.contacts;
          saveContactsToLocalStorage();
        }
        renderContacts();
      })
      .catch(() => {
        renderContacts();
      });
  })();


  // ===== Sync status panel =====
  // The badge next to "Save JSON" should reflect the real state: it shows
  // "All changes synced" only when the live data matches what is currently in
  // data.json, and "Unsynced changes" when the app holds edits that have not
  // yet been written to data.json. Deriving the status from the data (instead
  // of a stored boolean flag) fixes the bug where the panel kept reporting
  // "Unsynced changes" even after a successful Save JSON.
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

  const refreshSnapshotMatches = (onDisk) =>
    deepEqual(allTickets || [], onDisk.tickets || []) &&
    deepEqual(window._sharedTodos || [], onDisk.todos || []) &&
    deepEqual(onboardingDocuments || [], onDisk.onboarding || []) &&
    deepEqual(faqItems || [], onDisk.faq || []) &&
    deepEqual(contactsItems || [], onDisk.contacts || []);

  const refreshSyncState = async () => {
    try {
      const response = await fetch("data.json");
      if (!response.ok) return;
      const fileData = await response.json();
      const onDisk = Array.isArray(fileData)
        ? { tickets: fileData, todos: [] }
        : fileData || {};
      if (refreshSnapshotMatches(onDisk)) {
        markSynced();
      } else {
        markUnsynced();
      }
    } catch (error) {
      // If data.json cannot be read, leave the panel in its current state.
    }
  };

  // Decide the panel state now that every section has been loaded.
  refreshSyncState();

  // ===== Simple hash router: each section card behaves as its own page =====
  // No hash => show the Home section. A hash such as #tickets shows only that
  // section card, so each card works like its own page without extra HTML files.
  const routeSections = Array.from(document.querySelectorAll("main > section"));
  const homeSection = document.getElementById("home");

  const applyRoute = () => {
    const hash = (window.location.hash || "").replace(/^#/, "");
    let active = hash ? document.getElementById(hash) : null;

    if (!active || !active.matches("main > section")) {
      active = homeSection || routeSections[0] || null;
    }

    routeSections.forEach((section) => {
      if (active && section === active) {
        section.removeAttribute("hidden");
        section.style.gridColumn = "1 / -1";
      } else {
        section.setAttribute("hidden", "");
        section.style.gridColumn = "";
      }
    });
  };

  window.addEventListener("hashchange", applyRoute);
  applyRoute();

});
