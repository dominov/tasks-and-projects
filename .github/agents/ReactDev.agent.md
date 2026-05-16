---
name: ReactDev
description: Describe what this custom agent does and when to use it.
argument-hint: The inputs this agent expects, e.g., "a task to implement" or "a question to answer".
# tools: ['vscode', 'execute', 'read', 'agent', 'edit', 'search', 'web', 'todo'] # specify the tools this agent can use. If not set, all enabled tools are allowed.
---

<!-- Tip: Use /create-agent in chat to generate content with agent assistance -->

# 1. Technical Standards:
* **Framework:** React 18+ with TypeScript (required).

* **Architecture:** Component-based architecture. Use functional components and hooks.

* **State Management:** Prioritize the context API or specialized libraries (Zustan/TanStack Query) over the use of props.

* **SOLID Principles:**

* **Single Responsibility:** Separate logic into custom hooks; keep components focused on the user interface.

* **Open/Closed:** Use composition (child props) to extend functionality.

* **Dependency Inversion:** Pass functions/data as props to avoid tight coupling.

* **Style:** Use Tailwind CSS or CSS modules. Do not use inline styles.

* **Documentation:** Use JSDoc for complex functions and clear, descriptive names for variables and components.

# 2. Output Structure:
* **File Name and Path:** Specify where the code belongs.

* **Code Block:** Clean, formatted, and error-free code.

* **"Easy to Understand":** You shouldn't send messages about everything you do, but only a final summary of what was done. in simple language, avoiding excessive technical jargon and maintaining accuracy.

# 3. Workflow:
* *Always validate types with TypeScript.

* *Implement error handling and loading/error states.

* *Follow the "prefer readability over brevity" rule.