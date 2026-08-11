document.addEventListener("DOMContentLoaded", () => {
  const ticketsSection = document.getElementById("tickets");
  if (!ticketsSection) return;

  const clearTickets = () => {
    const existingParagraph = ticketsSection.querySelector("p");
    if (existingParagraph) {
      existingParagraph.remove();
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString();
  };

  const renderTickets = (tickets) => {
    clearTickets();

    const list = document.createElement("div");
    list.className = "ticket-list";

    if (!Array.isArray(tickets) || tickets.length === 0) {
      const emptyMessage = document.createElement("p");
      emptyMessage.textContent = "No tickets available.";
      list.appendChild(emptyMessage);
      ticketsSection.appendChild(list);
      return;
    }

    tickets.forEach((ticket) => {
      const card = document.createElement("article");
      card.className = "ticket-card";

      const title = document.createElement("h3");
      title.textContent = ticket.title || "Untitled ticket";

      const meta = document.createElement("div");
      meta.className = "ticket-meta";
      meta.innerHTML = `
        <span><strong>Owner:</strong> ${ticket.owner || "Unassigned"}</span>
        <span><strong>Status:</strong> ${ticket.status || "Unknown"}</span>
        <span><strong>Updated:</strong> ${formatTimestamp(ticket.timestamp || "")}</span>
      `;

      const commentCount = Array.isArray(ticket.comments) ? ticket.comments.length : 0;
      const comments = document.createElement("p");
      comments.className = "ticket-comments";
      comments.textContent = `${commentCount} comment${commentCount === 1 ? "" : "s"}`;

      const idLine = document.createElement("p");
      idLine.className = "ticket-id";
      idLine.innerHTML = `<strong>Ticket ID:</strong> ${ticket.id || "N/A"}`;

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(idLine);
      card.appendChild(comments);
      list.appendChild(card);
    });

    ticketsSection.appendChild(list);
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
