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
      const payload = { tickets: allTickets, todos: window._sharedTodos || [], onboarding: onboardingDocuments };
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
          markUnsynced();
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
          markUnsynced();
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
            toggle.className = "todo-done-btn";
            toggle.textContent = t.completed ? "Mark open" : "Mark done";
            toggle.addEventListener("click", () => {
              t.completed = !t.completed;
              saveTodosToLocalStorage(todos);
              markUnsynced();
              renderTodos(todos);
            });

            const editButton = document.createElement("button");
            editButton.type = "button";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => {
              editingTodoId = t.id;
              renderTodos(todos);
            });

            const remove = document.createElement("button");
            remove.type = "button";
            remove.textContent = "Delete";
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
          editButton.className = "new-ticket-btn";
          editButton.textContent = "Edit";
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

});
