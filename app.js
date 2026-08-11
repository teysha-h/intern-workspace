document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

  const syncStatusEl = document.getElementById("sync-status");
  const syncJsonBtn = document.getElementById("sync-json-btn");

  let allTickets = [];
  let showForm = false;
  let writableFileHandle = null;
  let hasUnsyncedChanges = false;
  const storageKey = "intern-workspace-tickets";
  let editingTicketId = null;

  const commentsToTextarea = (comments) => {
    if (Array.isArray(comments)) {
      return comments.join("\n");
    }
    return String(comments || "");
  };

  const parseComments = (value) => {
    return String(value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
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
    const { titleInput, ownerInput, statusSelect, commentsInput } = fields;
    if (!titleInput.checkValidity() || !ownerInput.checkValidity() || !statusSelect.checkValidity()) {
      titleInput.reportValidity();
      ownerInput.reportValidity();
      statusSelect.reportValidity();
      return;
    }

    const title = String(titleInput.value || "").trim();
    const owner = String(ownerInput.value || "").trim();
    const status = String(statusSelect.value || "").trim();
    const comments = parseComments(String(commentsInput.value || ""));

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
          return parsed;
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
        const comments = String(formData.get("comments") || "").trim();

        if (!title || !owner || !status) {
          return;
        }

        const newTicket = {
          id: getNextTicketId(allTickets),
          title,
          owner,
          status,
          comments: comments ? [comments] : [],
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

    const table = document.createElement("table");
    table.className = "ticket-table";

    const headerRow = document.createElement("tr");
    headerRow.innerHTML = `
      <th>ID</th>
      <th>Title</th>
      <th>Owner</th>
      <th>Status</th>
      <th>Comments</th>
      <th>Timestamp</th>
      <th>Actions</th>
    `;

    const thead = document.createElement("thead");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tickets.forEach((ticket) => {
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
        const commentsInput = document.createElement("textarea");
        commentsInput.name = "comments";
        commentsInput.value = commentsToTextarea(ticket.comments);
        commentsCell.appendChild(commentsInput);
        row.appendChild(commentsCell);

        row.appendChild(createTextCell(formatTimestamp(ticket.timestamp)));

        const actionsCell = document.createElement("td");
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.className = "new-ticket-btn ticket-action-btn";
        saveButton.textContent = "Save";
        saveButton.addEventListener("click", async (event) => {
          event.preventDefault();
          await saveEditingTicket(ticket.id, { titleInput, ownerInput, statusSelect, commentsInput });
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
        commentsCell.textContent = Array.isArray(ticket.comments)
          ? ticket.comments.join(", ")
          : ticket.comments || "";
        row.appendChild(commentsCell);

        row.appendChild(createTextCell(formatTimestamp(ticket.timestamp)));

        const actionsCell = document.createElement("td");
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

        actionsCell.append(editButton, deleteButton);
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
  if (storedTickets) {
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
        allTickets = Array.isArray(data) ? data : [];
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
