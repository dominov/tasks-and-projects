Project Summary: Personal Task Management (Monolith)
🏗️ Architecture and Technology Stack
Model: Monolithic desktop application (no external backend).
Technologies: Electron with React and TypeScript.
Database: SQLite (via better-sqlite3) for local storage, ensuring maximum privacy and speed.
Philosophy: Pragmatism and efficiency; optimized design for rapid development using AI agents.

🗂️ Data Model and Core Logic
Entities: Tasks (name, dates, description, project, priority, tags, story points, parent task, category, dependency, recurrence).

Date Engine: Business day logic (excludes weekends and Colombian holidays/manual days).

Dependencies: Chain shifting system in the Gantt chart; if a task is moved, its successors are automatically shifted, respecting business days.

Recurrence: Automatic generation of individual tasks upon reaching their due date, without carrying over dependencies.

Time Tracking: Optional recording of start and end times (timestamps) with confirmation notification upon completion.

🖼️ User Interface (UX/UI)
Layout: Three-column design (Side Menu, Main View, Details Panel).

Details Panel (Push Sidebar):

Located on the right, it pushes the main content.

Dynamic color based on the selected project.

Instant field auto-save.

Creation Flow: Only the title is required to enable the "Create" button.

Automatically hidden when navigating between views.

Side Menu: Navigation between "Today," "My tasks," Projects (below the project list), Calendar, and Gantt chart.

👁️ Main Views
My Tasks View: This is a table with all created tasks. The columns represent some of the task attributes, which can be edited directly in the table view or by selecting a task to open the details view on the right.

TODAY View: The productivity hub. Includes scheduled tasks, overdue tasks, and the 6-block information system (Story Points). Allows dynamic grouping by Priority, Project, or Points.

Calendar View: Interactive with drag-and-drop functionality. Visually slimmer weekends. Create tasks by clicking on empty spaces and continuous view for multi-day tasks.

Gantt Chart: A visual tool for corporate reports with waterfall logic and a clean view mode for screenshots.

⚙️ Advanced and DevOps Features
Export: Instant generation of CSV files with raw database data (without interface calculations).

Productivity: Command palette, native system notifications, and custom hotkeys.

Deployment: Simple packaging using Electron-builder to generate local executables; manual version updates.

🚀 Implementation Roadmap
Phase 1: Boilerplate, SQLite, Table View, Sidebar, and TODAY View.

Phase 2: Weekdays Engine and Interactive Calendar View.

Phase 3: Dependency Engine and Interactive Gantt Chart.

Phase 4: Native notifications, hotkeys, and final polish.