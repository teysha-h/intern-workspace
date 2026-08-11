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

  const commentsToTextarea = (comments) => {
    if (!Array.isArray(comments)) return "";
    return comments.map((comment) => comment.text).join("\n");
  };

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

  const setSyncStatus = (state, message = "") => {
    if (!syncStatusEl) return;

    const nextClass = state === "synced" ? "sync-badge connected" : "sync-badge reconnect";
    syncStatusEl.className = nextClass;
    syncStatusEl.textContent = message || (state === "synced" ? "All changes synced" : "Unsynced changes");
  };

  const markUnsynced = () => {
    hasUnsyncedChanges = true;
    setSyncStatus("unsynced", "Unsynced changes");
  };

  const markSynced = () => {
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
    const { titleInput, ownerInput, statusSelect } = fields;
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
    const comments = currentTicket?.comments || [];

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

    if (writableFileHandle) {
      await syncToJsonFile();
    } else {
      markUnsynced();
    }

    renderTickets(allTickets);
  };

  const deleteTicket = async (ticketId) => {
    allTickets = allTickets.filter((ticket) => ticket.id !== ticketId);
    saveToLocalStorage(allTickets);

    if (writableFileHandle) {
      await syncToJsonFile();
    } else {
      markUnsynced();
    }

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
      await writable.write(JSON.stringify(allTickets, null, 2));
      await writable.close();
      saveToLocalStorage(allTickets);
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
        commentsContainer.className = "ticket-comments";
        if (Array.isArray(ticket.comments) && ticket.comments.length) {
          ticket.comments.forEach((comment) => {
            const commentLine = document.createElement("div");
            commentLine.className = "ticket-comment-item";
            commentLine.textContent = `${comment.text} (${formatTimestamp(comment.timestamp)})`;
            commentsContainer.appendChild(commentLine);
          });
        } else {
          const noComments = document.createElement("span");
          noComments.textContent = "No comments yet";
          commentsContainer.appendChild(noComments);
        }
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
          await saveEditingTicket(ticket.id, { titleInput, ownerInput, statusSelect });
        });

        const addCommentButton = document.createElement("button");
        addCommentButton.type = "button";
        addCommentButton.className = "new-ticket-btn ticket-action-btn";
        addCommentButton.textContent = "Add comment";
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
          if (writableFileHandle) {
            await syncToJsonFile();
          } else {
            markUnsynced();
          }
          renderTickets(allTickets);
        });

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "new-ticket-btn ticket-action-btn cancel";
        cancelButton.textContent = "Cancel";
        cancelButton.addEventListener("click", (event) => {
          event.preventDefault();
          cancelEditingTicket();
        });

        actionsCell.append(saveButton, addCommentButton, cancelButton);
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
        addCommentButton.className = "new-ticket-btn ticket-action-btn";
        addCommentButton.textContent = "Add comment";
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
          if (writableFileHandle) {
            await syncToJsonFile();
          } else {
            markUnsynced();
          }
          renderTickets(allTickets);
        });

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "new-ticket-btn ticket-action-btn";
        editButton.textContent = "Edit";
        editButton.addEventListener("click", () => startEditingTicket(ticket.id));

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "new-ticket-btn ticket-action-btn cancel";
        deleteButton.textContent = "Delete";
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

  markSynced();

  const storedTickets = loadFromLocalStorage();
  if (storedTickets !== null) {
    allTickets = storedTickets;
    renderTickets(allTickets);
  } else {
    fetch("data.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Network response was not ok");
        }
        return response.json();
      })
      .then((data) => {
        allTickets = Array.isArray(data) ? data.map(normalizeTicket) : [];
        saveToLocalStorage(allTickets);
        renderTickets(allTickets);
      })
      .catch(() => {
        clearTickets();
        const errorMessage = document.createElement("p");
        errorMessage.textContent = "Unable to load ticket data.";
        ticketsSection.appendChild(errorMessage);
      });
  }
});
