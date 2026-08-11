document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

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
    });

    header.appendChild(newTicketButton);
    ticketsSection.appendChild(header);

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
    table.appendChild(tbody);

    ticketsSection.appendChild(table);
  };

  fetch("data.json")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      return response.json();
    })
    .then((data) => renderTickets(data))
    .catch(() => {
      clearTickets();
      const errorMessage = document.createElement("p");
      errorMessage.textContent = "Unable to load ticket data.";
      ticketsSection.appendChild(errorMessage);
    });
});
