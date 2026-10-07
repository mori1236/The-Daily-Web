# Final Project Requirements — Web Application Development Course, Summer Semester

## General

Students must implement a web system for managing, editing, and publishing news, similar to modern news sites, according to the requirements below and using **only** technologies taught in the course.

---

## Administrative Requirements

### 1. Group Structure

- Work is done in groups of 4-5 students.
- Every student in the group must know the entire system codebase and be able to answer questions about every component of the implementation.

### 2. Version Control (Git)

- Git must be used throughout the entire development period.
- Each student must work from their own personal computer using a personal Git account.
- Git must be used according to accepted practices: frequent, documented commits, use of branches, merges and pull requests, and a proper collaborative workflow.
- At the defense, the group must present clear documentation of how they worked together, including each student's contribution.

### 3. Assignment of Students to Lecturers

- All group members must be registered with the same lecturer.
- Students registered with different lecturers cannot be combined.
- Groups found mixing lecturers — their project will not be graded and will receive a score of 0.

### 4. Submission and Defense Dates

- The project must be submitted at least 24 hours before the defense. The submission box closes at 23:59 the day before the defense.
- A student who does not submit on time — 20 points will be deducted from the project grade.
- A special date will be granted only with special approval from the Dean of Students, with appropriate documents.
- Each student may be examined only once; it is not possible to improve or retake after being examined.

### 5. Submission Method

- Submit a Zip file of the full code on Moodle.
- Additionally, include in the submission note a secure link to the project's Git repository. The repository must be viewable.
- **It is strictly forbidden** to upload files containing sensitive information such as passwords, API keys, or tokens to the repository.

---

## Defense Requirements

### 1. System Presentation

- At the defense, the system will be tested based only on the submitted code version, with no ability to make changes.
- The lecturer will actually operate the system and examine its stability, completeness, and functionality.

### 2. Code Knowledge

- The lecturer may ask any student questions about the system structure, the code written, and its purpose.
- Every student must demonstrate full command of the entire codebase, not only the part they worked on directly.

### 3. Additional Checks

Beyond the defense session, the lecturer will independently review the entire project to determine the final grade.

### 4. Grading

The grade will be determined by:

- The defense
- Code quality
- System appearance
- User experience
- Stability
- Teamwork
- Meeting the technical requirements

---

## Technology Requirements

### 1. Permitted Technologies

- Use only technologies, languages, and architectures taught in the course (such as: HTML, CSS, Flexbox, JavaScript, Node.js, Express, MongoDB — as taught).
- Using external libraries or frameworks not taught in class is forbidden, e.g.: React, Angular, Vue, etc.

### 2. Self-Learning

- Some project requirements are self-learning requirements, on which you will be examined.
- You must be able to use the knowledge acquired in class and apply it independently to solve new problems.

---

## Additional Requirements

### 1. Code Originality

- The code must be solely the work of the students in the group.
- Automatic and manual checks for copied code will be performed. Copied code will disqualify the entire project.

### 2. Use of AI

- AI-based tools (such as ChatGPT or similar) may be used during development.
- However, every student must deeply understand the code added using these tools.
- During the defense, the lecturer may ask about any line of code. Inability to explain the code will be considered a lack of command of the project and may significantly affect the grade.

### 3. Documentation

A documentation file (README) must be included, containing:

1. Installation and run instructions for the system.
2. Project structure (main folders and files).
3. A short description of the core functionality and implemented features.

### 4. Legality and Permitted Use

Only legal, free, and permitted tools and content may be used.

### 5. Preview and Pre-Check

Students must make sure the system works on their personal computers and that it can be run and demonstrated successfully before the defense.

---

# Final Project — "The Daily Web" News System

## Product Specification

### Home Screen — News Feed

The main page is open to all users and shows only approved and published articles.

The page will include:

1. A news feed with infinite scroll, which automatically loads 20 more articles when the user approaches the bottom of the feed.
2. Article search.
3. Filtering by category and/or viewed/not viewed, and sorting by publish date or popularity.
4. Basic info for each article: title, image, summary, category, reporter, and publish date.
5. Navigation to the full article page.
6. Search, filtering, sorting, and loading more articles happen without a full page refresh.

### Article Page

The article page is open to all users and will include:

1. Article details: title, reporter name, category, publish date, and main image.
2. The full article content.
3. A comments area including the comment list and a form for adding a new comment.
4. When a new comment is added, it appears immediately in the comment list, without reloading the entire list.

Every visit to an article counts toward the system's view data and statistics.

#### Comment Limiting

To prevent spam:

- A guest may post at most **3 comments per minute** from the same device.
- Attempts to exceed the limit will be blocked by the server, returning an appropriate message to the user.

### Login Screen

The system will include a login screen for reporters and editors.

After logging in:

- A reporter is redirected to their workspace.
- An editor can access the management area.
- User permissions are determined by the authenticated user, not by information that can be manually changed in the browser.

### Reporter Area — Article Management

A reporter sees the articles belonging to them and their status.

An article can be in one of the following states:

- "Draft"
- "Pending editor approval"
- "Published"
- "Returned for revisions"

The reporter can:

1. Create a new article.
2. Edit their own article that is in draft.
3. Submit a completed article for editor approval.
4. See the note the editor wrote when an article was returned for revisions.
5. Make the revisions and resubmit it.
6. Also edit an article that has already been published.

#### Article State Transitions

Transitions between article states follow this process:

| Who | Transition | Notes |
|-----|------------|-------|
| System | Creation → "Draft" | A new article is created in "Draft" state |
| Reporter (on their own article) | "Draft" → "Pending editor approval" | |
| Editor | "Pending editor approval" → "Published" | |
| Editor | "Pending editor approval" → "Returned for revisions" | With a revision note |
| Reporter | "Returned for revisions" → "Pending editor approval" | After editing the article |

- Any other transition between states is not allowed.
- When the content of an already-published article is edited, the new version goes through the same approval process, while the last approved version continues to be shown to the public, per the requirements below.
- There is no requirement to support simultaneous editing of the same article by multiple users; you may assume this does not happen.

#### Work Continuity

While writing or editing an article:

- The reporter's work is saved continuously without needing to click a "Save" button.
- Closing the browser, refreshing the page, or switching to another computer will not cause loss of work.
- When the reporter returns to editing, they get the latest version they worked on.

#### Editing an Already-Published Article

When a reporter starts editing an existing article that has already been published:

- Readers continue to see the last approved version.
- The reporter's changes do not appear on the public site while they work.
- Even after submitting the changes for approval, the existing article continues to be shown as usual.
- Only after editor approval does the new content appear to the public.

### Editor Area — Content Management and Approval

The editor can view all articles in the system and filter them by state.

For an article pending approval, the editor can:

1. View the submitted content.
2. Edit the article themselves.
3. Approve and publish the article.
4. Return the article to the reporter for revisions.
5. Attach a note explaining which revisions are needed.
6. Delete an article as needed.

When it's an update to an already-published article, the editor must be able to understand what the currently published content is and what the new content pending approval is.

Approving the changes makes the new content the version shown to readers.

### Statistics Area — Impact Analytics

The editor can select an article and view a graph showing the number of views of the article over time.

Chart.js or canvas may be used to display the graph.

The graph will include:

1. A time axis.
2. View count along the time axis.
3. Clear marking of the points in time when an editor approved and published an update to the article.
4. The ability to understand from the graph how the view count changed before and after an update was published.

> For example, if an article was updated at 14:00, the same graph will show view behavior before and after the update point.

Assume the site may serve **thousands of readers concurrently**. You must decide how to correctly collect, represent, and store this data to support the requested graph.

---

## Architecture and Technologies

- The server is based on Node.js with Express as the framework.
- The system is designed and implemented using the MVC pattern, with clear separation between Model, View, and Controller.
- Data storage and retrieval are done with MongoDB and Mongoose.
- The client side uses Vanilla JavaScript, including Ajax for asynchronous operations with the server without a full page refresh.
- The system's data interfaces are designed according to REST principles.
- The system uses EJS where appropriate.
- The article page must be accessible to search engines: the full article content must appear in the initial HTML returned by the server and must not depend on running JavaScript in the browser.
- At the same time, interactive areas such as search, filtering, pagination, and comments update without a full page refresh.
- The system uses HTML5 and appropriate semantic tags.
- The interface is responsive and suitable for desktop, tablet, and mobile.

---

## Database and Models

The system will include at least four main models:

- **a.** Users
- **b.** Articles
- **c.** Comments
- **d.** View data and statistics

Each model supports full CRUD operations: Create, Read (List/Search), Update, Delete.

The search mechanism must allow searching on at least one main field (e.g., by article title).

---

## Security, Authentication, and Authorization

- The system includes three user types: Guest, Reporter, Editor.
- Reporter and editor authentication is done with username and password.
- Passwords are not stored in the database as plain text, and it must not be possible to recover the original password from them.
- A user who is not logged in can access only the public areas of the site.
- A reporter can create articles and edit only articles belonging to them.
- A reporter cannot publish an article themselves.
- An editor can view and edit all articles in the system, approve publication, return an article for revisions, and delete content.
- **All permission checks are also performed on the server side.** Hiding buttons or screens on the client side is not considered implementing permissions.
- If the server restarts, a user who has already authenticated must be able to continue using the system as usual, without needing to log in again.

---

## Error Handling, Validity, and Performance

- Errors, edge cases, and invalid data must be handled on both the client and server sides.
- Unauthorized actions or invalid data must not crash the server.
- Search, filtering, and sorting must return correct results.
- The system must remain fast and usable even when the database contains thousands of articles.
- Logs of errors and significant operational events must be kept.

---

## External Service Integration

A weather widget is displayed in the site's sidebar.

- Use a well-known free external Web Service, e.g., OpenWeatherMap or an equivalent service.
- Use a plan that does not require entering credit card details.
- Weather data shown to the user may be delayed by up to 15 minutes at most.
- Assume the site may serve thousands of concurrent users.

---

## Demo

Before the defense, demo data must be loaded into the system that allows fully demonstrating all requirements.

The demo data will include at least:

- 500 articles in various states and categories
- Several reporter users
- An editor user
- Comments on articles
- Articles in progress
- Articles pending approval
- Published articles
- Several articles that went through multiple updates after publishing
- View data over time sufficient to display the Impact Analytics graph and the update publish points

During the defense, also demonstrate:

- Permission cases
- Work continuity
- Working after a server restart
- Search and pagination behavior over the database
- Comment limiting
- System behavior with the weather service
