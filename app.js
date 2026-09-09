// ===== Collapsible side navigation =====
// The former top nav bar is now a fixed panel on the left edge of the page.
// The two buttons below simply add/remove the `side-nav-collapsed` class on
// <body>; styles.css slides the panel away and releases its reserved space.
// This runs immediately (the script tag sits after the markup) so a
// remembered "collapsed" state is applied before the page is painted.

// localStorage key that pins how the sidebar starts
// ("always-expanded" / "always-collapsed"); when unset the sidebar falls back
// to remembering its last open/collapsed state, exactly as it did before the
// Settings section existed. The value is honoured if present (for example a
// preference stored by an earlier version), even though the Settings panel no
// longer offers a control for it.
const SIDEBAR_START_PREF_KEY = "intern-workspace-settings-sidebar-start";

(() => {
  const sideNav = document.getElementById("side-nav");
  const openBtn = document.getElementById("side-nav-open-btn");
  const closeBtn = document.getElementById("side-nav-close-btn");
  const storageKey = "intern-workspace-side-nav-collapsed";
  const overlayQuery = window.matchMedia("(max-width: 720px)");

  if (!sideNav) return;

  // Read the remembered state; without one, start collapsed on small screens
  // (where the open panel would otherwise cover the content on load).
  let startCollapsed = overlayQuery.matches;
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored !== null) startCollapsed = stored === "1";
  } catch (error) {
    /* Storage unavailable - just use the viewport default. */
  }

  // A start state pinned in the (now removed) Settings control overrides the
  // remembered state above where one exists already; with no preference set,
  // the behaviour is unchanged.
  try {
    const startPref = localStorage.getItem(SIDEBAR_START_PREF_KEY);
    if (startPref === "always-expanded") startCollapsed = false;
    else if (startPref === "always-collapsed") startCollapsed = true;
  } catch (error) {
    /* Preference unreadable - keep the remembered/default state. */
  }

  const setCollapsed = (collapsed) => {
    document.body.classList.toggle("side-nav-collapsed", collapsed);
    if (openBtn) {
      openBtn.hidden = !collapsed;
      openBtn.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
    try {
      localStorage.setItem(storageKey, collapsed ? "1" : "0");
    } catch (error) {
      /* State simply won't be remembered across reloads. */
    }
  };

  if (openBtn) openBtn.addEventListener("click", () => setCollapsed(false));
  if (closeBtn) closeBtn.addEventListener("click", () => setCollapsed(true));

  // On small screens the open panel overlays the page, so collapse it again
  // after a link is tapped so the target section stays visible.
  sideNav.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", () => {
      if (overlayQuery.matches) setCollapsed(true);
    });
  });

  setCollapsed(startCollapsed);
})();

document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

  // Admin password store. The login popup checks this exact value when an admin
  // signs in, and the Settings panel's password changer overwrites it. It lives
  // in localStorage (like every other workspace setting) so a change survives a
  // reload; until one is saved, the well-known default below keeps fresh
  // browsers behaving exactly as they did before the changer existed.
  const adminPasswordStorageKey = "intern-workspace-admin-password";
  const DEFAULT_ADMIN_PASSWORD = "abc123";

  const getAdminPassword = () => {
    try {
      const stored = localStorage.getItem(adminPasswordStorageKey);
      return typeof stored === "string" && stored.length > 0
        ? stored
        : DEFAULT_ADMIN_PASSWORD;
    } catch (error) {
      return DEFAULT_ADMIN_PASSWORD;
    }
  };

  const setAdminPassword = (password) => {
    try {
      localStorage.setItem(adminPasswordStorageKey, password);
    } catch (error) {
      console.warn("Unable to save admin password locally", error);
    }
  };

  const syncStatusEl = document.getElementById("sync-status");
  const syncJsonBtn = document.getElementById("sync-json-btn");

  let allTickets = [];
  let showForm = false;
  let searchQuery = "";
  let sortMode = "default";
  let writableFileHandle = null;
  const storageKey = "intern-workspace-tickets";
  let editingTicketId = null;
  let commentingTicketId = null;
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
  // Owner dropdowns for the ticket tracker and the shared to-do read the live
  // team roster (admin included) from the existing Team section (#team-list) so
  // the choices always match the people on the page and never need a duplicated
  // copy or a change to data.json.
  const getTeamMembers = () => {
    const cards = document.querySelectorAll("#team-list .contact-item.team-member");
    return Array.from(cards)
      .map((card) => (card.querySelector("h3") ? card.querySelector("h3").textContent.trim() : ""))
      .filter(Boolean);
  };

  // Builds an <select name="owner" required> listing every team member, with an
  // empty "Select owner" first option so required validation still applies.
  const buildOwnerSelect = (selected = "") => {
    const select = document.createElement("select");
    select.name = "owner";
    select.required = true;

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select owner";
    select.appendChild(placeholder);

    getTeamMembers().forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      if (selected && selected === name) option.selected = true;
      select.appendChild(option);
    });

    return select;
  };

  // ----- Wrap-capable dropdowns (ticket edit row) --------------------------
  // Native <select> elements cannot wrap their text: the closed value and
  // the browser-drawn popup always stay single-line no matter what CSS says.
  // The ticket editor therefore uses this small custom listbox so long owner
  // names and status labels wrap instead of being clipped, consistent with
  // the multiline title/comment boxes. Every other dropdown on the page
  // keeps its native <select>: deliberately scoped to the ticket edit row.
  //
  // The returned object mimics the few native-select behaviours that
  // saveEditingTicket() relies on (.value, .checkValidity(),
  // .reportValidity()), so saving and validation logic stays unchanged.
  let wrappingDropdownDismissBound = false;
  const bindWrappingDropdownDismissal = () => {
    if (wrappingDropdownDismissBound) return;
    wrappingDropdownDismissBound = true;

    // Clicking anywhere outside an open dropdown closes it.
    document.addEventListener("click", (event) => {
      document.querySelectorAll(".wrapping-dropdown[data-open]").forEach((dropdown) => {
        if (!dropdown.contains(event.target)) setWrappingDropdownOpen(dropdown, false);
      });
    });

    // Escape closes the open dropdown and returns focus to its toggle.
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const dropdown = document.querySelector(".wrapping-dropdown[data-open]");
      if (!dropdown) return;
      event.preventDefault();
      setWrappingDropdownOpen(dropdown, false);
      const toggle = dropdown.querySelector(".wrapping-dropdown-toggle");
      if (toggle) toggle.focus();
    });
  };

  const setWrappingDropdownOpen = (dropdown, open) => {
    const options = dropdown.querySelector(".wrapping-dropdown-options");
    const toggle = dropdown.querySelector(".wrapping-dropdown-toggle");
    if (open) {
      bindWrappingDropdownDismissal();
      dropdown.setAttribute("data-open", "");
      if (options) {
        options.hidden = false;
        // Bring the selected entry into view inside the scrollable panel.
        const selected = options.querySelector(".wrapping-dropdown-option.selected");
        if (selected && typeof selected.scrollIntoView === "function") {
          try {
            selected.scrollIntoView({ block: "nearest" });
          } catch (error) {
            /* Engines without layout support ignore positioning. */
          }
        }
      }
      if (toggle) toggle.setAttribute("aria-expanded", "true");
    } else {
      dropdown.removeAttribute("data-open");
      if (options) options.hidden = true;
      if (toggle) toggle.setAttribute("aria-expanded", "false");
    }
  };

  const buildWrappingDropdown = ({ fieldName, placeholder, options, value, required }) => {
    const currentValue = String(value || "");

    const root = document.createElement("div");
    root.className = "wrapping-dropdown";
    root.dataset.fieldName = fieldName;
    if (required) root.classList.add("wrapping-dropdown--required");
    if (!currentValue) root.classList.add("is-placeholder");

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "wrapping-dropdown-toggle";
    toggle.setAttribute("aria-haspopup", "listbox");
    toggle.setAttribute("aria-expanded", "false");

    const label = document.createElement("span");
    label.className = "wrapping-dropdown-label";
    label.textContent = currentValue || placeholder;

    const chevronWrap = document.createElement("span");
    chevronWrap.className = "wrapping-dropdown-chevron";
    chevronWrap.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    toggle.appendChild(label);
    toggle.appendChild(chevronWrap);

    const listEl = document.createElement("ul");
    listEl.className = "wrapping-dropdown-options";
    listEl.setAttribute("role", "listbox");
    listEl.hidden = true;

    let stateValue = currentValue;

    options.forEach((optionText) => {
      const item = document.createElement("li");
      item.className = "wrapping-dropdown-option";
      item.setAttribute("role", "option");
      if (optionText === currentValue) {
        item.classList.add("selected");
        item.setAttribute("aria-selected", "true");
      }

      const optionButton = document.createElement("button");
      optionButton.type = "button";
      optionButton.className = "wrapping-dropdown-option-btn";
      optionButton.textContent = optionText;

      optionButton.addEventListener("click", () => {
        stateValue = optionText;
        label.textContent = optionText;
        root.classList.remove("is-placeholder", "wrapping-dropdown--invalid");
        listEl.querySelectorAll(".wrapping-dropdown-option").forEach((other) => {
          other.classList.toggle("selected", other === item);
          if (other === item) other.setAttribute("aria-selected", "true");
          else other.removeAttribute("aria-selected");
        });
        setWrappingDropdownOpen(root, false);
        toggle.focus();
      });

      item.appendChild(optionButton);
      listEl.appendChild(item);
    });

    toggle.addEventListener("click", () => {
      setWrappingDropdownOpen(root, !root.hasAttribute("data-open"));
    });

    // Basic keyboard support: Up/Down opens the list and walks its entries;
    // Enter/Space activate them because the entries are real buttons.
    root.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      if (!root.hasAttribute("data-open")) setWrappingDropdownOpen(root, true);
      const optionButtons = Array.from(listEl.querySelectorAll(".wrapping-dropdown-option-btn"));
      if (!optionButtons.length) return;
      const currentIndex = optionButtons.indexOf(document.activeElement);
      let nextIndex;
      if (event.key === "ArrowDown") {
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % optionButtons.length;
      } else {
        nextIndex = currentIndex <= 0 ? optionButtons.length - 1 : currentIndex - 1;
      }
      optionButtons[nextIndex].focus();
    });

    root.appendChild(toggle);
    root.appendChild(listEl);

    // Native-select-compatible surface consumed by saveEditingTicket().
    return {
      root,
      get value() {
        return stateValue;
      },
      checkValidity() {
        return !required || String(stateValue || "").trim() !== "";
      },
      reportValidity() {
        if (!this.checkValidity()) {
          root.classList.add("wrapping-dropdown--invalid");
          toggle.focus();
          return false;
        }
        root.classList.remove("wrapping-dropdown--invalid");
        return true;
      },
    };
  };

  // Visual marker for owners whose value is "Unassigned" (e.g. set when their
  // team member was removed from the roster). Purely cosmetic: it only changes
  // how the owner text looks in the Ticket tracker and shared To-Do list -
  // stored values, filters and editing behaviour are completely untouched.
  const isUnassignedOwner = (value) =>
    String(value || "").trim().toLowerCase() === "unassigned";

  const buildOwnerBadge = () => {
    const span = document.createElement("span");
    span.className = "owner-unassigned";
    span.textContent = "Unassigned";
    return span;
  };

  // ===== Team / Admin control =====
  // The Team roster is data-driven (single source of truth held here) instead of
  // duplicated in index.html. It is seeded from the existing hard-coded cards in
  // #team-list so the page behaves exactly as before, then persisted to
  // localStorage and included in the "Save JSON" sync. Because the Ticket/To-Do
  // owner dropdowns (getTeamMembers) and the login popup already read this same
  // DOM live, re-rendering the roster automatically propagates adds/removes
  // across the whole page.
  const teamSection = document.getElementById("team");
  let teamMembers = [];

  const teamStorageKey = "intern-workspace-team";
  let editingTeamMemberIndex = null;

  const saveTeamToLocalStorage = () => {
    try {
      localStorage.setItem(teamStorageKey, JSON.stringify(teamMembers));
    } catch (error) {
      console.warn("Unable to save team locally", error);
    }
  };

  const loadTeamFromLocalStorage = () => {
    try {
      const stored = localStorage.getItem(teamStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (error) {
      console.warn("Unable to load team from local storage", error);
    }
    return null;
  };

  // Who is signed in right now (parsed sessionStorage current-user JSON).
  const getCurrentUser = () => {
    try {
      const raw = sessionStorage.getItem("intern-workspace-current-user");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.name ? parsed : null;
    } catch (error) {
      return null;
    }
  };

  // Only admins can add/remove members; regular members see the roster read-only.
  const isAdminView = () => {
    const user = getCurrentUser();
    return !!(user && user.admin);
  };

  // Refresh the Ticket and To-Do sections so their owner dropdowns pick up the
  // live roster. These render functions already read #team-list via
  // getTeamMembers(), so no extra re-wiring is needed here.
  const rerenderOwnerConsumers = () => {
    renderTickets(allTickets);
    if (typeof renderTodos === "function") renderTodos(window._sharedTodos || []);
  };

  const renderTeam = () => {
    if (!teamSection) return;
    const adminView = isAdminView();

    // Preserve only the section heading and rebuild a brand-new list container
    // each time. Reusing the existing node after clearing the section would
    // re-attach its old children (duplicating every card), so a fresh element
    // is created here.
    const preserveHeading = teamSection.querySelector("h2");
    teamSection.innerHTML = "";
    if (preserveHeading) teamSection.appendChild(preserveHeading);

    const list = document.createElement("div");
    list.className = "contacts-list";
    list.id = "team-list";
    teamSection.appendChild(list);

    // Admin-only "Add member" form sits just above the roster.
    if (adminView) {
      const addForm = buildTeamAddForm();
      if (addForm) {
        const addWrap = document.createElement("div");
        addWrap.className = "team-add-wrap";
        addWrap.appendChild(addForm);
        teamSection.insertBefore(addWrap, list);
      }
    }

    if (teamMembers.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "No team members yet.";
      list.appendChild(empty);
      return;
    }

    teamMembers.forEach((member, index) => {
      const item = document.createElement("div");
      item.className = "contact-item team-member";
      if (member.admin) item.classList.add("admin");

      // Edit mode: swap the read-only details for an inline form.
      if (adminView && editingTeamMemberIndex === index) {
        item.classList.add("contact-item--editing");
        const form = buildTeamEditForm(member, index);
        if (form) item.appendChild(form);
        list.appendChild(item);
        return;
      }

      const header = document.createElement("div");
      header.className = "contact-header";

      const name = document.createElement("h3");
      name.textContent = member.name || "";

      // Admin can manage every non-admin member (the admin card is protected).
      if (adminView && !member.admin) {
        const actions = document.createElement("div");
        actions.className = "contact-item-actions team-member-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "new-ticket-btn edit-btn";
        editButton.innerHTML = editIconSvg;
        editButton.setAttribute("aria-label", "Edit");
        editButton.setAttribute("data-tooltip", "Edit");
        editButton.addEventListener("click", (event) => {
          event.preventDefault();
          editingTeamMemberIndex = index;
          renderTeam();
        });

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "new-ticket-btn delete-btn";
        deleteButton.innerHTML = deleteIconSvg;
        deleteButton.setAttribute("aria-label", "Remove from team");
        deleteButton.setAttribute("data-tooltip", "Remove from team");
        deleteButton.addEventListener("click", (event) => {
          event.preventDefault();
          if (!confirm(`Remove ${member.name} from the team?`)) return;
          const removedName = String(member.name || "").trim();
          teamMembers.splice(index, 1);
          editingTeamMemberIndex = null;
          saveTeamToLocalStorage();

          // Keep every ticket/shared to-do owned by the removed member, but
          // change its owner to "Unassigned" so no owner field keeps pointing
          // at someone who is no longer on the team. Only the owner string
          // changes; items are never deleted here.
          if (removedName) {
            let reassignedTickets = 0;
            if (Array.isArray(allTickets)) {
              allTickets.forEach((ticket) => {
                if (String(ticket.owner || "").trim() === removedName) {
                  ticket.owner = "Unassigned";
                  reassignedTickets += 1;
                }
              });
              if (reassignedTickets > 0) saveToLocalStorage(allTickets);
            }

            const todosList = Array.isArray(window._sharedTodos) ? window._sharedTodos : [];
            let reassignedTodos = 0;
            todosList.forEach((todo) => {
              if (String(todo.owner || "").trim() === removedName) {
                todo.owner = "Unassigned";
                reassignedTodos += 1;
              }
            });
            if (reassignedTodos > 0) saveTodosToLocalStorage(todosList);
          }

          markUnsynced();
          rerenderOwnerConsumers();
          renderTeam();
        });

        actions.append(editButton, deleteButton);
        header.append(name, actions);
      } else {
        header.appendChild(name);
      }

      item.appendChild(header);

      const role = document.createElement("p");
      role.className = "contact-role";
      role.textContent = member.role || (member.admin ? "Admin" : "Member");
      item.appendChild(role);

      const details = document.createElement("div");
      details.className = "contact-details";
      if (member.email) {
        const emailLink = document.createElement("a");
        emailLink.href = `mailto:${member.email}`;
        emailLink.textContent = member.email;
        details.appendChild(emailLink);
      }
      item.appendChild(details);

      list.appendChild(item);
    });
  };

  const buildTeamAddForm = () => {
    const form = document.createElement("form");
    form.className = "contact-edit-form team-add-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.name = "name";
    nameInput.required = true;
    nameInput.placeholder = "New member name";
    nameLabel.appendChild(nameInput);

    const roleLabel = document.createElement("label");
    roleLabel.textContent = "Role";
    const roleInput = document.createElement("input");
    roleInput.name = "role";
    roleInput.value = "Member";
    roleLabel.appendChild(roleInput);

    const emailLabel = document.createElement("label");
    emailLabel.textContent = "Email";
    const emailInput = document.createElement("input");
    emailInput.name = "email";
    emailInput.type = "email";
    emailInput.placeholder = "name@example.com";
    emailLabel.appendChild(emailInput);

    const actions = document.createElement("div");
    actions.className = "contact-edit-actions";

    const addButton = document.createElement("button");
    addButton.type = "submit";
    addButton.className = "new-ticket-btn";
    addButton.textContent = "Add member";
    addButton.addEventListener("click", (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const name = String(nameInput.value || "").trim();
      if (!name) return;
      if (teamMembers.some((m) => String(m.name || "").toLowerCase() === name.toLowerCase())) {
        nameInput.setCustomValidity("A team member with this name already exists.");
        form.reportValidity();
        nameInput.setCustomValidity("");
        return;
      }
      teamMembers.push({
        name,
        role: String(roleInput.value || "Member").trim(),
        email: String(emailInput.value || "").trim(),
        admin: false,
      });
      saveTeamToLocalStorage();
      markUnsynced();
      form.reset();
      roleInput.value = "Member";
      rerenderOwnerConsumers();
      renderTeam();
    });

    actions.appendChild(addButton);
    form.append(nameLabel, roleLabel, emailLabel, actions);
    return form;
  };

  const buildTeamEditForm = (member, index) => {
    const form = document.createElement("form");
    form.className = "contact-edit-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Name";
    const nameInput = document.createElement("input");
    nameInput.name = "name";
    nameInput.required = true;
    nameInput.value = member.name || "";
    nameLabel.appendChild(nameInput);

    const roleLabel = document.createElement("label");
    roleLabel.textContent = "Role";
    const roleInput = document.createElement("input");
    roleInput.name = "role";
    roleInput.value = member.role || "Member";
    roleLabel.appendChild(roleInput);

    const emailLabel = document.createElement("label");
    emailLabel.textContent = "Email";
    const emailInput = document.createElement("input");
    emailInput.name = "email";
    emailInput.type = "email";
    emailInput.value = member.email || "";
    emailLabel.appendChild(emailInput);

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
      member.name = name;
      member.role = String(roleInput.value || "Member").trim();
      member.email = String(emailInput.value || "").trim();
      editingTeamMemberIndex = null;
      saveTeamToLocalStorage();
      markUnsynced();
      rerenderOwnerConsumers();
      renderTeam();
    });

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "new-ticket-btn";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", (event) => {
      event.preventDefault();
      editingTeamMemberIndex = null;
      renderTeam();
    });

    actions.append(saveButton, cancelButton);
    form.append(nameLabel, roleLabel, emailLabel, actions);
    return form;
  };

  // Shared data.json loader. Each section used to fetch("data.json") on its
  // own; this memoizes a single request to one network call that every section
  // and the sync-status check reuse. It mirrors the old
  // "response.ok ? response.json() : null" shape, so a bad response resolves to
  // null and every caller keeps exactly its current fallback behaviour.
  let dataJsonPromise = null;
  const loadDataJson = () => {
    if (!dataJsonPromise) {
      dataJsonPromise = fetch("data.json").then((response) => (response.ok ? response.json() : null));
    }
    return dataJsonPromise;
  };

  // Initialize Team: prefer localStorage, then data.json (if it has a team key),
  // else seed from the existing hard-coded cards in #team-list so nothing in
  // index.html has to change. Rendering here (before tickets/todos first render)
  // ensures their owner dropdowns see the current roster from the start.
  (function initTeam() {
    if (!teamSection) return;

    const seedFromCards = () => {
      const cards = document.querySelectorAll("#team-list .contact-item.team-member");
      return Array.from(cards).map((card) => ({
        name: (card.querySelector("h3") ? card.querySelector("h3").textContent.trim() : "") || "Unknown",
        role: (card.querySelector(".contact-role") ? card.querySelector(".contact-role").textContent.trim() : "") || "Member",
        email: (card.querySelector(".contact-details a") ? card.querySelector(".contact-details a").textContent.trim() : "") || "",
        admin: card.classList.contains("admin"),
      }));
    };

    const local = loadTeamFromLocalStorage();
    if (local !== null) {
      teamMembers = local;
      renderTeam();
      return;
    }
    loadDataJson()
      .then((data) => {
        if (data && Array.isArray(data.team)) {
          teamMembers = data.team;
        } else {
          teamMembers = seedFromCards();
        }
        saveTeamToLocalStorage();
        renderTeam();
      })
      .catch(() => {
        teamMembers = seedFromCards();
        renderTeam();
      });
  })();


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
    setSyncStatus("unsynced", "Unsynced changes");
  };

    const markSynced = () => {
    setSyncStatus("synced", "All changes synced");
  };

  const startEditingTicket = (ticketId) => {
    editingTicketId = ticketId;
    // Opening the editor closes any open inline comment composer so only one
    // row-level editor/composer is open at a time.
    commentingTicketId = null;
    renderTickets(allTickets);
  };

  const cancelEditingTicket = () => {
    editingTicketId = null;
    renderTickets(allTickets);
  };

  // Inline "add comment" composer state: exactly one ticket row shows the
  // composer at a time (same pattern as editingTicketId). The composer
  // replaces the old native prompt() popup with a text box right inside the
  // Comments cell of the table.
  const startAddComment = (ticketId) => {
    commentingTicketId = ticketId;
    renderTickets(allTickets);
  };

  const cancelAddComment = () => {
    commentingTicketId = null;
    renderTickets(allTickets);
  };

  // Saves the inline composer's text as a new comment. Mirrors the previous
  // prompt() behaviour: empty input is ignored, and the comment keeps the same
  // { text, timestamp } shape, persisted through the same localStorage / sync
  // badge / re-render paths every other ticket change uses.
  const saveAddComment = (ticketId, commentInput) => {
    const commentText = String(commentInput.value || "").trim();
    if (!commentText) return;

    const newComment = { text: commentText, timestamp: new Date().toISOString() };
    allTickets = allTickets.map((item) => {
      if (item.id !== ticketId) return item;
      return {
        ...item,
        comments: Array.isArray(item.comments) ? [...item.comments, newComment] : [newComment],
      };
    });

    saveToLocalStorage(allTickets);
    commentingTicketId = null;
    markUnsynced();
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
      const payload = { tickets: allTickets, todos: window._sharedTodos || [], onboarding: onboardingDocuments, faq: faqItems, contacts: contactsItems, team: teamMembers };
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

  // Formats a timestamp (ticket created date and comment timestamps) using the
  // user's locale. Seconds are intentionally omitted so times read as
  // e.g. "1:30 PM" rather than "1:30:45 PM".
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? timestamp
      : date.toLocaleString(undefined, {
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
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

  // ===== Status donut chart (displayed in the Dashboard section card) =====
  // This builds a donut chart for the ticket tracker's status column and
  // shows it in the Dashboard section. It reflects the live ticket tracker
  // automatically: it is re-rendered inside renderTickets(), which is the
  // single refresh path every ticket change (create / edit / change status /
  // delete / add comment) runs through. Counts are actual numbers, not
  // percentages. The same builder is kept reusable if it is ever needed
  // anywhere else.
  // Status colours follow the page's cream + blue scheme: a soft cream for
  // Open, a mid blue for In Progress, and the deep corporate blue for Resolved.
  const STATUS_CHART_COLORS = {
    Open: "#F3E9CE",
    "In Progress": "#7FA8D9",
    Resolved: "#1F4E79",
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

  const dashboardStatusCanvas = document.querySelector("#dashboard-status-chart .dashboard-status-chart-canvas");

  // Draw the donut into the Dashboard section card with the latest ticket statuses.
  // Called from renderTickets() so it refreshes whenever the tracker changes.
  const renderDashboardStatusChart = () => {
    if (!dashboardStatusCanvas) return;
    dashboardStatusCanvas.innerHTML = "";
    dashboardStatusCanvas.appendChild(renderStatusChart(allTickets));
  };

  // ----- Edit-mode text box sizing --------------------------------------
  // While a ticket is being edited, its title and comments render as
  // multi-line text boxes that grow to fit their full content so every
  // word stays visible instead of scrolling out of sight.
  const autosizeEditorBox = (box) => {
    if (!box) return;
    box.style.height = "auto";
    // An element that is not yet in the document reports a scrollHeight
    // of 0. Skip such measurements: renderTickets() runs a real pass once
    // the table is attached to the document, and the CSS min-heights keep
    // empty boxes usable until then.
    if (box.scrollHeight > 0) {
      box.style.height = `${box.scrollHeight}px`;
    }
  };

  // Re-fits a box whenever its text changes while typing/pasting.
  const bindEditorAutosize = (box) => {
    box.addEventListener("input", () => autosizeEditorBox(box));
    return box;
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

    // Keep the Dashboard-section status chart in sync with the tracker.
    renderDashboardStatusChart();

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

      // Owner is chosen from the live team roster dropdown (admin included).
      const ownerField = form.querySelector(".ticket-form-owner");
      if (ownerField) ownerField.appendChild(buildOwnerSelect());

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
        // A multi-line text box instead of a single-line <input> so long
        // titles wrap onto extra lines instead of scrolling out of sight.
        // It keeps name/required/value and auto-grows (bindEditorAutosize),
        // and saving is unaffected because a textarea exposes the same
        // .value and validity methods that saveEditingTicket relies on.
        const titleInput = bindEditorAutosize(document.createElement("textarea"));
        titleInput.name = "title";
        titleInput.required = true;
        titleInput.className = "ticket-title-editor";
        titleInput.rows = 1;
        titleInput.value = ticket.title || "";
        titleCell.appendChild(titleInput);
        row.appendChild(titleCell);

        const ownerCell = document.createElement("td");
      // Wrapping listbox instead of a native <select>: native dropdowns
        // cannot wrap their text, so long owner names would be clipped.
        const ownerInput = buildWrappingDropdown({
          fieldName: "owner",
          placeholder: "Select owner",
          options: getTeamMembers(),
          value: ticket.owner || "",
          required: true,
        });
        ownerCell.appendChild(ownerInput.root);
        row.appendChild(ownerCell);

        const statusCell = document.createElement("td");
        // Same wrap-capable dropdown as Owner, so status labels never clip.
        const statusSelect = buildWrappingDropdown({
          fieldName: "status",
          placeholder: "Select status",
          options: ["Open", "In Progress", "Resolved"],
          value: ticket.status || "",
          required: true,
        });
        statusCell.appendChild(statusSelect.root);
        row.appendChild(statusCell);

        const commentsCell = document.createElement("td");
        const commentsContainer = document.createElement("div");
        commentsContainer.className = "ticket-comment-editors";
        // One separate text box per existing comment. There is deliberately no
        // empty "new comment" box, so editing cannot add new comments.
        const commentInputs = (Array.isArray(ticket.comments) ? ticket.comments : []).map(
          (comment) => {
            // Auto-growing text box so the whole comment stays visible.
            const commentInput = bindEditorAutosize(document.createElement("textarea"));
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
        const ownerCell = document.createElement("td");
        if (isUnassignedOwner(ticket.owner)) {
          ownerCell.appendChild(buildOwnerBadge());
        } else {
          ownerCell.textContent = ticket.owner || "";
        }
        row.appendChild(ownerCell);
        // Read-only Status becomes a tinted pill (see .ticket-status in CSS).
        // The stored text is unchanged, as is the edit-mode dropdown; this only
        // wraps the same label in a class so CSS can colour it.
        const statusLabel = document.createElement("span");
        statusLabel.className =
          "ticket-status ticket-status--" +
          String(ticket.status || "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
        statusLabel.textContent = ticket.status || "";
        const statusCell = document.createElement("td");
        statusCell.appendChild(statusLabel);
        row.appendChild(statusCell);

        const commentsCell = document.createElement("td");
        const commentsContainer = document.createElement("div");
        commentsContainer.className = "ticket-comments";
        if (Array.isArray(ticket.comments) && ticket.comments.length) {
          ticket.comments.forEach((comment) => {
            const commentLine = document.createElement("div");
            commentLine.className = "ticket-comment-item";
            // Each comment is one tile like a shared to-do task: the comment
            // text on top, and the ticket-table timestamp beneath it as the
            // muted meta line (mirroring where a to-do shows its owner).
            const commentText = document.createElement("div");
            commentText.className = "ticket-comment-text";
            commentText.textContent = comment.text;
            const commentMeta = document.createElement("div");
            commentMeta.className = "ticket-comment-meta";
            commentMeta.textContent = formatTimestamp(comment.timestamp);
            commentLine.append(commentText, commentMeta);
            commentsContainer.appendChild(commentLine);
          });
        }
        // Inline "add comment" composer: replaces the old native prompt()
        // popup. While this ticket's composer is open, an auto-growing text
        // box and Add/Cancel buttons appear directly under the existing
        // comments inside the same cell, reusing the edit-row box/button
        // styles so it looks native to the table.
        if (commentingTicketId === ticket.id) {
          const composer = document.createElement("div");
          composer.className = "ticket-comment-composer";

          const commentInput = bindEditorAutosize(document.createElement("textarea"));
          commentInput.className = "ticket-comment-editor";
          commentInput.rows = 2;
          commentInput.setAttribute("aria-label", "New comment");
          commentInput.placeholder = "Enter a new comment...";

          const composerActions = document.createElement("div");
          composerActions.className = "ticket-comment-composer-actions";

          const addButton = document.createElement("button");
          addButton.type = "button";
          addButton.className = "new-ticket-btn ticket-action-btn";
          addButton.textContent = "Add";
          addButton.addEventListener("click", () => saveAddComment(ticket.id, commentInput));

          const cancelButton = document.createElement("button");
          cancelButton.type = "button";
          cancelButton.className = "new-ticket-btn ticket-action-btn cancel";
          cancelButton.textContent = "Cancel";
          cancelButton.addEventListener("click", () => cancelAddComment());

          // Escape dismisses the composer, matching how the wrapping dropdowns
          // and other inline editors close on Escape.
          commentInput.addEventListener("keydown", (event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              cancelAddComment();
            }
          });

          composerActions.append(addButton, cancelButton);
          composer.append(commentInput, composerActions);
          commentsContainer.appendChild(composer);
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
        // Toggles the inline composer for this row instead of opening the old
        // native prompt() popup. The saving itself lives in saveAddComment().
        addCommentButton.addEventListener("click", (event) => {
          event.preventDefault();
          if (commentingTicketId === ticket.id) {
            cancelAddComment();
          } else {
            startAddComment(ticket.id);
          }
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

    // Fit every edit-mode text box (and an open composer's box) to its content
    // now that the table is in the document (detached elements measure as
    // zero, so this cannot run earlier). Rows being edited or an open inline
    // comment composer are the only places that render <textarea> elements, so
    // this picks up exactly the open editor's boxes and the composer's box.
    if (editingTicketId !== null || commentingTicketId !== null) {
      table.querySelectorAll("textarea").forEach(autosizeEditorBox);
    }

    // Refocus a freshly re-created inline comment composer and move the cursor
    // to the end so typing can continue (the same re-focus trick used by the
    // search box, keeping the composer usable across any re-render).
    if (commentingTicketId !== null) {
      const composerInput = table.querySelector(".ticket-comment-composer .ticket-comment-editor");
      if (composerInput) {
        composerInput.focus();
        composerInput.setSelectionRange(composerInput.value.length, composerInput.value.length);
      }
    }
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
    loadDataJson()
      .then((data) => {
        if (data === null) throw new Error("Network response was not ok");
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

            const ownerInput = buildOwnerSelect(t.owner || "");

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
            if (isUnassignedOwner(t.owner)) {
              // Same visible text as before, just wrapped so the owner word gets
              // the pale-red "owner-unassigned" styling.
              meta.append(
                buildOwnerBadge(),
                document.createTextNode(` • due ${formatDueDate(t.dueDate || "")}`)
              );
            } else {
              meta.textContent = `${t.owner || ""} • due ${formatDueDate(t.dueDate || "")}`;
            }

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
      <label>Task<input name="task" required /></label>
      <label class="todo-form-owner">Owner</label>
      <label>Due date<input name="dueDate" type="date" /></label>
      <div class="todo-form-actions">
        <button type="submit" class="new-ticket-btn">Add</button>
      </div>
    `;

    // Owner is chosen from the live team roster dropdown (admin included).
    const todoOwnerLabel = form.querySelector(".todo-form-owner");
    if (todoOwnerLabel) todoOwnerLabel.appendChild(buildOwnerSelect());

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

    // Place the add-task box directly beneath the filter/sorting bar and above
    // the task list. When there is no filter bar (no tasks yet), keep the form
    // at the end, right after the empty-state message.
    const filterBar = container.querySelector(".todo-filters");
    if (filterBar) {
      filterBar.after(form);
    } else {
      container.appendChild(form);
    }
    todoSection.appendChild(container);

    // Keep the Dashboard shared to-do completion gauge in sync with the current
    // task list. Every add/edit/toggle/delete flows through renderTodos, so
    // this single call keeps the gauge current.
    renderTodoGauge(todos);
  };

  // Builds/updates the shared to-do completion gauge shown in the Dashboard card.
  //
  // This only reflects the current tasks: it reads `todos`, computes the
  // percentage of completed tasks and pushes those values into the #todo-gauge
  // structure from index.html. It never writes to the data, so it cannot
  // corrupt the task list.
  const renderTodoGauge = (todos) => {
    const gauge = document.getElementById("todo-gauge");
    if (!gauge) return;

    const list = Array.isArray(todos) ? todos : [];
    const total = list.length;
    const completed = list.filter((t) => t && t.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const valueEl = gauge.querySelector(".todo-gauge-center-value");
    const captionEl = gauge.querySelector(".todo-gauge-caption");
    const progressPath = gauge.querySelector(".todo-gauge-progress");

    if (valueEl) valueEl.textContent = `${percent}%`;
    if (captionEl) captionEl.textContent = `${completed} completed of ${total} tasks`;

    // Fill the half-circle arc up to the current percentage. The arc's length
    // is half a circle (PI * radius), so the dash length scales linearly with
    // the percentage from the left-hand end of the gauge, colouring in the
    // gauge in proportion to how much of the shared to-do list is complete.
    // We set it via inline style so it overrides the stylesheet's default
    // stroke-dasharray (setting it as an attribute would be beaten by CSS).
    if (progressPath) {
      const r = Number(progressPath.getAttribute("data-arc-radius")) || 80;
      const halfCirc = Math.PI * r;
      const length = total > 0 ? (percent / 100) * halfCirc : 0;
      progressPath.style.strokeDasharray = `${length} ${halfCirc}`;
    }
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
    loadDataJson()
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
    loadDataJson()
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
    loadDataJson()
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
    loadDataJson()
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
    deepEqual(contactsItems || [], onDisk.contacts || []) &&
    (!Array.isArray(onDisk.team) || deepEqual(teamMembers || [], onDisk.team));

  const refreshSyncState = async () => {
    try {
      const fileData = await loadDataJson();
      if (fileData === null) return;
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
  // No hash => show the Dashboard section. A hash such as #tickets shows only that
  // section card, so each card works like its own page without extra HTML files.
  const routeSections = Array.from(document.querySelectorAll("main > section"));
  const dashboardSection = document.getElementById("dashboard");

  const applyRoute = () => {
    const hash = (window.location.hash || "").replace(/^#/, "");
    let active = hash ? document.getElementById(hash) : null;

    if (!active || !active.matches("main > section")) {
      active = dashboardSection || routeSections[0] || null;
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

  // ===== Settings panel =====
  // Builds the controls for the #settings section (opened from the "Settings"
  // entry in the side navigation; the hash router above shows the section
  // automatically). Two items are offered:
  //   1. "Sync to JSON" - performs the same action as the "Save JSON" button in
  //      the header: it calls the very same syncToJsonFile() helper, so all
  //      workspace data is written to the connected JSON file exactly as before.
  //   2. "Change admin password" - an admin-only form (the same isAdminView()
  //      gate the Team section uses). It asks for the current password, then
  //      the new one twice, and only writes through to the shared admin-password
  //      store when the current password matches and the two new entries are
  //      identical. No strength rules are enforced on the new value.
  // Everything is self-contained and guarded with an early return, so if the
  // section is ever missing from the markup the rest of the page is unaffected.
  (function initSettings() {
    const settingsSection = document.getElementById("settings");
    const settingsList = document.getElementById("settings-list");
    if (!settingsSection || !settingsList) return;

    // Row 1: sync to the JSON file, wired to the existing sync helper so the
    // behaviour is identical to the "Save JSON" button in the header.
    const syncRow = document.createElement("div");
    syncRow.className = "settings-item";

    const syncLabel = document.createElement("p");
    syncLabel.className = "settings-item-label";
    syncLabel.textContent = "Sync to JSON";

    const syncButton = document.createElement("button");
    syncButton.type = "button";
    syncButton.className = "new-ticket-btn settings-btn";
    syncButton.textContent = "Sync to JSON";
    syncButton.addEventListener("click", () => {
      syncToJsonFile();
    });

    // Group the button and the live status chip side by side. The chip is
    // marked up in the settings section (hidden) so the #sync-status lookup in
    // setSyncStatus() keeps working; appending it here simply moves it into
    // this row.
    const syncActions = document.createElement("div");
    syncActions.className = "settings-sync-actions";
    syncActions.appendChild(syncButton);
    if (syncStatusEl) {
      syncStatusEl.hidden = false;
      syncActions.appendChild(syncStatusEl);
    }

    syncRow.append(syncLabel, syncActions);

    // Row 2: change the admin password. Only visible while an admin is signed
    // in; the sign-in flow toggles this same row to match the chosen identity.
    // The three checks the task asks for all live in the submit handler below.
    const passwordRow = document.createElement("div");
    passwordRow.className = "settings-item";
    passwordRow.id = "settings-password-row";
    passwordRow.hidden = !isAdminView();

    const passwordLabel = document.createElement("p");
    passwordLabel.className = "settings-item-label";
    passwordLabel.textContent = "Change admin password";

    const passwordForm = document.createElement("form");
    passwordForm.className = "settings-password-form";
    passwordForm.noValidate = true;

    const currentLabel = document.createElement("label");
    currentLabel.className = "settings-password-label";
    currentLabel.textContent = "Current password";
    const currentInput = document.createElement("input");
    currentInput.type = "password";
    currentInput.name = "current-password";
    currentInput.autocomplete = "current-password";
    currentInput.placeholder = "Enter current password";
    currentLabel.appendChild(currentInput);

    const newLabel = document.createElement("label");
    newLabel.className = "settings-password-label";
    newLabel.textContent = "New password";
    const newInput = document.createElement("input");
    newInput.type = "password";
    newInput.name = "new-password";
    newInput.autocomplete = "new-password";
    newInput.placeholder = "Enter new password";
    newLabel.appendChild(newInput);

    const confirmLabel = document.createElement("label");
    confirmLabel.className = "settings-password-label";
    confirmLabel.textContent = "Confirm new password";
    const confirmInput = document.createElement("input");
    confirmInput.type = "password";
    confirmInput.name = "confirm-password";
    confirmInput.autocomplete = "new-password";
    confirmInput.placeholder = "Enter new password again";
    confirmLabel.appendChild(confirmInput);

    const passwordMessage = document.createElement("p");
    passwordMessage.className = "settings-password-message";
    passwordMessage.hidden = true;

    const passwordActions = document.createElement("div");
    passwordActions.className = "settings-password-actions";

    const confirmButton = document.createElement("button");
    confirmButton.type = "submit";
    confirmButton.className = "new-ticket-btn settings-btn";
    confirmButton.textContent = "Confirm";

    passwordActions.appendChild(confirmButton);

    passwordForm.addEventListener("submit", (event) => {
      event.preventDefault();

      if (currentInput.value !== getAdminPassword()) {
        passwordMessage.className = "settings-password-message error";
        passwordMessage.textContent = "Current password is incorrect.";
        passwordMessage.hidden = false;
        currentInput.focus();
        return;
      }

      if (!newInput.value || newInput.value !== confirmInput.value) {
        passwordMessage.className = "settings-password-message error";
        passwordMessage.textContent = "New passwords do not match.";
        passwordMessage.hidden = false;
        newInput.focus();
        return;
      }

      setAdminPassword(newInput.value);
      currentInput.value = "";
      newInput.value = "";
      confirmInput.value = "";
      passwordMessage.className = "settings-password-message success";
      passwordMessage.textContent = "Password changed successfully.";
      passwordMessage.hidden = false;
      confirmButton.focus();
    });

    passwordForm.append(
      currentLabel,
      newLabel,
      confirmLabel,
      passwordMessage,
      passwordActions,
    );

    passwordRow.append(passwordLabel, passwordForm);

    settingsList.append(syncRow, passwordRow);
  })();

  // ===== Login "who are you?" popup + signed-in badge =====
  // Shows a modal overlay once per browser session (sessionStorage) and keeps a
  // small "signed in as" badge in the top-right corner that reflects the saved
  // identity. The list of people is read live from the existing Team section
  // (#team-list) so it always matches the roster on the page and never needs a
  // duplicated copy. Everything here is self-contained: it only appends overlay
  // and badge markup on top of the already-functional page without re-wiring
  // any existing logic.
  (function initLoginPopup() {
    const userStorageKey = "intern-workspace-current-user";

    // Builds/updates the persistent badge that shows who is signed in. If no
    // member is provided the badge is left in place (the popup just closes).
    const renderUserBadge = (member) => {
      if (!member || !member.name) return;
      let badge = document.getElementById("signed-in-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.id = "signed-in-badge";
        badge.className = "signed-in-badge";
        document.body.appendChild(badge);
      }

      badge.innerHTML = "";
      const label = document.createElement("span");
      label.className = "signed-in-badge-label";
      label.textContent = "Signed in as";

      const nameSpan = document.createElement("span");
      nameSpan.className = "signed-in-badge-name";
      nameSpan.textContent = member.name;

      if (member.admin) badge.classList.add("admin");
      else badge.classList.remove("admin");

      if (member.role) badge.setAttribute("data-role", member.role);
      badge.append(label, nameSpan);
    };

    // 1. If an identity is already recorded for this session, just show the
    //    badge and skip the popup.
    let storedUser = null;
    try {
      const raw = sessionStorage.getItem(userStorageKey);
      if (raw) storedUser = JSON.parse(raw);
    } catch (e) {
      // If sessionStorage is unavailable, still show the popup.
    }
    if (storedUser) {
      renderUserBadge(storedUser);
      return;
    }

    // 2. Read the team roster from the existing Team section markup.
    const teamCards = document.querySelectorAll("#team-list .contact-item.team-member");
    if (!teamCards.length) return; // no roster to choose from; skip silently

    const members = Array.from(teamCards).map((card) => ({
      name: (card.querySelector("h3") ? card.querySelector("h3").textContent.trim() : "") || "Unknown",
      role: (card.querySelector(".contact-role") ? card.querySelector(".contact-role").textContent.trim() : "") || "Member",
      admin: card.classList.contains("admin"),
    }));

    // 3. Build the overlay and card.
    const overlay = document.createElement("div");
    overlay.className = "login-modal";

    const card = document.createElement("div");
    card.className = "login-modal-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");

    const title = document.createElement("h2");
    title.id = "login-modal-title";
    title.className = "login-modal-title";
    title.textContent = "Welcome — who are you?";

    const prompt = document.createElement("p");
    prompt.className = "login-modal-prompt";
    prompt.textContent = "Select your name so the team knows who is signed in.";

    const options = document.createElement("div");
    options.className = "login-modal-options";

    const close = () => {
      try {
        overlay.remove();
      } catch (err) {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
    };

    // Inline password prompt shown when the admin card is selected. Hides the
    // member list and swaps the prompt text for a small form. The correct
    // password (the shared admin password - default abc123, editable from the
    // Settings panel) completes the sign-in; a wrong/empty password shows an
    // inline error and keeps the popup open for another try. "Cancel" returns
    // to the member list so a user can pick a non-admin if they change their mind.

    const showAdminPasswordPrompt = (member) => {
      const originalPrompt = prompt.textContent;
      options.style.display = "none";

      prompt.textContent = `Enter the admin password to sign in as ${member.name}.`;

      const form = document.createElement("form");
      form.className = "login-modal-admin-form";
      form.noValidate = true;

      const label = document.createElement("label");
      label.className = "login-modal-admin-label";
      label.textContent = "Password";
      label.htmlFor = "login-modal-password";

      const input = document.createElement("input");
      input.id = "login-modal-password";
      input.type = "password";
      input.name = "password";
      input.autocomplete = "current-password";
      input.placeholder = "Enter password";
      label.appendChild(input);

      const error = document.createElement("p");
      error.className = "login-modal-admin-error";
      error.hidden = true;

      const actions = document.createElement("div");
      actions.className = "login-modal-admin-actions";

      const cancelButton = document.createElement("button");
      cancelButton.type = "button";
      cancelButton.className = "login-modal-cancel-btn";
      cancelButton.textContent = "Cancel";
      cancelButton.addEventListener("click", () => {
        form.remove();
        prompt.textContent = originalPrompt;
        options.style.display = "";
        if (input.value) input.value = "";
      });

      const submitButton = document.createElement("button");
      submitButton.type = "submit";
      submitButton.className = "login-modal-submit-btn";
      submitButton.textContent = "Sign in";

      actions.append(cancelButton, submitButton);
      form.append(label, error, actions);

      const submitHandler = (event) => {
        event.preventDefault();
        if (input.value === getAdminPassword()) {
          signIn(member);
        } else {
          error.textContent = "Incorrect password. Please try again.";
          error.hidden = false;
          input.focus();
          if (input.value) input.select();
        }
      };
      form.addEventListener("submit", submitHandler);

      card.appendChild(form);
      input.focus();
    };

    // Completes the sign-in the same way a non-admin card always did: persist the
    // chosen identity, show the signed-in badge, close the popup, then refresh the
    // Team section so the admin-only add/remove controls appear (or stay hidden).
    const signIn = (member) => {
      try {
        sessionStorage.setItem(userStorageKey, JSON.stringify(member));
      } catch (e) {
        // Non-fatal: popup still closes and the page remains fully usable.
      }
      renderUserBadge(member);
      close();
      renderTeam();

      // Reveal (or keep hidden) the admin-only "Change admin password" row to
      // match the identity just chosen; on a reload with a saved session the
      // row was already set correctly while the Settings panel was built.
      const passwordRow = document.getElementById("settings-password-row");
      if (passwordRow) passwordRow.hidden = !member.admin;
    };

    members.forEach((member) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "login-modal-option";
      if (member.admin) button.classList.add("admin");

      const nameSpan = document.createElement("span");
      nameSpan.className = "login-modal-name";
      nameSpan.textContent = member.name;

      const roleSpan = document.createElement("span");
      roleSpan.className = "login-modal-role";
      roleSpan.textContent = member.role;

      button.append(nameSpan, roleSpan);
      button.addEventListener("click", () => {
        // Admin selection requires a password before signing in; members sign in
        // straight away without one.
        if (member.admin) {
          showAdminPasswordPrompt(member);
        } else {
          signIn(member);
        }
      });
      options.appendChild(button);
    });

    card.append(title, prompt, options);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
  })();

});
