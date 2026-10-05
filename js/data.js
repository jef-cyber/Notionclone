/* ============================================================
   Lumen — static client data.

   Only things that belong in the frontend bundle live here: app metadata,
   default preferences, and the page templates. Everything a user creates
   comes from the API — there is no mock page data any more.
   ============================================================ */

window.LumenData = {
  app: {
    name: "Lumen",
    version: "1.0.0",
    tagline: "Notes, docs, and projects in one calm workspace.",
  },

  defaultSettings: {
    theme: "system", // light | dark | system
    sidebarOpen: true,
    sidebarBehavior: "collapsible", // collapsible | fixed
    compactMode: false,
    animations: true,
    confirmDelete: true,
  },

  /* ------------------------------------------------------------------
     Templates. `blocks` use the editor's internal vocabulary; the store
     translates them to the canonical block types on the way to the API.
     ------------------------------------------------------------------ */
  templates: [
    {
      id: "tpl-project",
      name: "Project Management",
      icon: "\uD83D\uDCC6",
      desc: "Goals, milestones, and tasks for any project",
      tone: 0,
      blocks: [
        { type: "heading1", content: "Project Plan" },
        { type: "text", content: "A place to organize everything about this project." },
        { type: "heading2", content: "Goal" },
        { type: "text", content: "Describe the outcome you want to achieve." },
        { type: "heading2", content: "Milestones" },
        { type: "todo", content: "Kickoff", checked: false },
        { type: "todo", content: "Design", checked: false },
        { type: "todo", content: "Build", checked: false },
        { type: "todo", content: "Launch", checked: false },
        { type: "heading2", content: "Open questions" },
        { type: "bulleted", content: "What does success look like?" },
        { type: "bulleted", content: "Who owns what?" },
      ],
    },
    {
      id: "tpl-meeting",
      name: "Meeting Notes",
      icon: "\uD83D\uDCCB",
      desc: "Capture agenda, updates, and action items",
      tone: 1,
      blocks: [
        { type: "heading1", content: "Meeting Notes" },
        { type: "text", content: "Date, attendees, agenda." },
        { type: "heading2", content: "Agenda" },
        { type: "bulleted", content: "Item 1" },
        { type: "bulleted", content: "Item 2" },
        { type: "bulleted", content: "Item 3" },
        { type: "heading2", content: "Action items" },
        { type: "todo", content: "Follow up on decisions", checked: false },
        { type: "todo", content: "Share notes with the team", checked: false },
      ],
    },
    {
      id: "tpl-journal",
      name: "Personal Journal",
      icon: "\uD83D\uDCD6",
      desc: "Daily reflections and moments worth keeping",
      tone: 2,
      blocks: [
        { type: "heading1", content: "Journal" },
        { type: "heading2", content: "Today" },
        { type: "text", content: "What happened today?" },
        { type: "heading2", content: "Gratitude" },
        { type: "bulleted", content: "Three things I'm grateful for" },
        { type: "heading2", content: "Tomorrow" },
        { type: "todo", content: "Top priority", checked: false },
      ],
    },
    {
      id: "tpl-study",
      name: "Study Planner",
      icon: "\uD83C\uDF93",
      desc: "Plan topics, sessions, and revision",
      tone: 3,
      blocks: [
        { type: "heading1", content: "Study Planner" },
        { type: "heading2", content: "This week" },
        { type: "todo", content: "Topic 1", checked: false },
        { type: "todo", content: "Topic 2", checked: false },
        { type: "todo", content: "Topic 3", checked: false },
        { type: "heading2", content: "Notes" },
        { type: "quote", content: "Review new material within 24 hours." },
      ],
    },
    {
      id: "tpl-todo",
      name: "To-Do List",
      icon: "\u2705",
      desc: "A simple list to get things done",
      tone: 4,
      blocks: [
        { type: "heading1", content: "To-Do List" },
        { type: "text", content: "Today's tasks." },
        { type: "todo", content: "First task", checked: false },
        { type: "todo", content: "Second task", checked: false },
        { type: "todo", content: "Third task", checked: false },
      ],
    },
    {
      id: "tpl-weekly",
      name: "Weekly Planner",
      icon: "\uD83D\uDCC5",
      desc: "Plan your week, day by day",
      tone: 0,
      blocks: [
        { type: "heading1", content: "Weekly Planner" },
        { type: "text", content: "The week at a glance." },
        { type: "heading2", content: "Goals" },
        { type: "todo", content: "Goal 1", checked: false },
        { type: "todo", content: "Goal 2", checked: false },
        { type: "heading2", content: "Monday" },
        { type: "bulleted", content: "Plan the day" },
        { type: "heading2", content: "Friday" },
        { type: "bulleted", content: "Reflect and plan next week" },
      ],
    },
    {
      id: "tpl-roadmap",
      name: "Product Roadmap",
      icon: "\uD83D\uDCE0",
      desc: "Prioritize features and track releases",
      tone: 1,
      blocks: [
        { type: "heading1", content: "Product Roadmap" },
        { type: "heading2", content: "Now" },
        { type: "todo", content: "Ship the MVP", checked: false },
        { type: "heading2", content: "Next" },
        { type: "todo", content: "Gather feedback", checked: false },
        { type: "heading2", content: "Later" },
        { type: "bulleted", content: "Bigger bets" },
        { type: "heading2", content: "Priorities" },
        {
          type: "database",
          content: "",
          database: {
            name: "Priorities",
            properties: {
              Task: { type: "title" },
              Status: { type: "select", options: ["Todo", "In Progress", "Done"] },
              Priority: { type: "select", options: ["Low", "Medium", "High"] },
            },
            rows: [
              { Task: "Search", Status: "In Progress", Priority: "High" },
              { Task: "Mobile", Status: "Todo", Priority: "Medium" },
            ],
          },
        },
      ],
    },
  ],
};
