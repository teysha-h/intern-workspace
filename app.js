document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

  const syncStatusEl = document.getElementById("sync-status");
  const connectJsonBtn = document.getElementById("connect-json-btn");
  const syncJsonBtn = document.getElementById("sync-json-btn");

  let allTickets = [];
  let showForm = false;
  let writableFileHandle = null;
  const storageKey = "intern-workspace-tickets";

  const setSyncStatus = (state, message = "") => {
    if (!syncStatusEl) return;

    const nextClass = state === "connected" ? "sync-badge connected" : "sync-badge reconnect";
    syncStatusEl.className = nextClass;
    syncStatusEl.textContent = message || (state === "connected" ? "Data Connected" : "Reconnect");
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
      setSyncStatus("connected", "Data Connected");
      return true;
    } catch (error) {
      setSyncStatus("reconnect", "Reconnect");
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
      setSyncStatus("connected", "Data Connected");
    } catch (error) {
      writableFileHandle = null;
      setSyncStatus("reconnect", "Reconnect");
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
    `;

    const thead = document.createElement("thead");
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tickets.forEach((ticket) => {
      const row = document.createElement("tr");

      const idCell = document.createElement("td");
      idCell.textContent = ticket.id || "";
      row.appendChild(idCell);

      const titleCell = document.createElement("td");
      titleCell.textContent = ticket.title || "";
      row.appendChild(titleCell);

      const ownerCell = document.createElement("td");
      ownerCell.textContent = ticket.owner || "";
      row.appendChild(ownerCell);

      const statusCell = document.createElement("td");
      statusCell.textContent = ticket.status || "";
      row.appendChild(statusCell);

      const commentsCell = document.createElement("td");
      const commentsValue = Array.isArray(ticket.comments)
        ? ticket.comments.join(", ")
        : ticket.comments || "";
      commentsCell.textContent = commentsValue;
      row.appendChild(commentsCell);

      const timestampCell = document.createElement("td");
      timestampCell.textContent = formatTimestamp(ticket.timestamp);
      row.appendChild(timestampCell);

      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    ticketsSection.appendChild(table);
  };

  if (connectJsonBtn) {
    connectJsonBtn.addEventListener("click", () => {
      connectToJsonFile();
    });
  }

  if (syncJsonBtn) {
    syncJsonBtn.addEventListener("click", () => {
      syncToJsonFile();
    });
  }

  setSyncStatus("reconnect", "Reconnect");

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
