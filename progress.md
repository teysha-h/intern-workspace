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
- Unit testing files created in branch 'unit-testing'
- Unit testing executed -> No errors detected and everything working well

### Next steps (after review):
1. Add a dashboard with summary charts on home page 
2. Add another page for team members 
3. Create a login page where the user can select who they are 
4. Create admin control (admin can add and remove people from the team)
5. Owner for the ticket is selected from a drop down of team members
6. Include a delete button for FAQs
7. Make comments in the ticket-tracker editable
8. Use icons instead of buttons for actions     


## Fri - 21st August 2026
### Completed tasks:
- Changed all 'edit' buttons to an icon. Shows the function when the cursor hovers over it.
- Did research into diagrams for conveying projects (actor, sequence, use case)


## Mon - 24th August 2026
### Completed tasks:
- Added a delete button to the FAQs
- Changed all 'delete' buttons to an icon   


## Thu - 27th August 2026
### Completed tasks:
- Made comments in ticket-tracker editable
- Changed 'add comment' button in ticket-tracker to an icon
- Changed 'mark done' button in todo to an icon
- Charts created to display ticket and to-do status on dashboard 
- Added a 'team' section to dispay team members
- Created a login page so users have to select which team member they are
- Changed the 'owner' field so it now consists of a drop down menu of team members
