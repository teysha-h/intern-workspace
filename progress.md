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
  - simple navigation bar with anchors for:
    - Dashboard
    - Tickets
    - To Do
    - Links
    - Onboarding
    - FAQ
    - Contacts
  - main content area with distinct sections:
    - dashboard summary cards
    - ticket tracker preview
    - shared to-do
    - links preview
    - onboarding resources preview
    - FAQ preview
    - contact list preview


Example structure:

- header/title
- navbar
- Dashboard section
  - 3–4 summary cards: open tickets, tasks due, top link, onboarding step
- Tickets section
  - a few placeholder ticket cards
- Shared to-do / links section
  - a simple list of tasks and link items
- Onboarding section
  - a couple of resource cards
- FAQ section
  - a couple of question/answer blocks
- Contacts section
  - a small contact list

What not to add yet:

- no ticket filtering
- no data loading from data.json
- no task completion logic
- no search or accordion interactivity
- no API/XHR calls

## Tue - 11th August 2026
### Completed:
- Planned and implemented dashboard cards linked to navbar using Copilot
- Tested and commited dashboard functionality
- Planned and implemented dashboard styling on styles.css using Copilot
- Tested and commited dashboard styling
- Planned and implemented the ticket tracker data structure using Copilot