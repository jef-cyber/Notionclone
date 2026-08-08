/* ============================================================
   Lumen — mock workspace data (Phase 1, frontend only)
   ============================================================ */

window.LumenData = {
  app: {
    name: "Lumen",
    version: "1.0.0",
    tagline: "Notes, docs, and projects in one calm workspace.",
  },

  workspace: {
    name: "My Workspace",
    icon: "\u25C8", // ◈
  },

  user: {
    name: "Alex Rivera",
    email: "alex@lumen.space",
    username: "alexrivera",
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
     Pages: flat array with parentId for nesting. Blocks live on each page.
     ------------------------------------------------------------------ */
  pages: [
    {
      id: "getting-started",
      title: "Getting Started",
      icon: "\u2728",
      parentId: null,
      favorite: true,
      createdAt: "2026-07-01",
      updatedAt: "2026-07-21",
      blocks: [
        { id: "gs-1", type: "heading1", content: "Welcome to Lumen" },
        {
          id: "gs-2",
          type: "paragraph",
          content:
            "Lumen is a minimal, frontend-only workspace inspired by Notion. Everything you see is built with HTML, CSS, and vanilla JavaScript, and your work is saved locally in your browser.",
        },
        {
          id: "gs-3",
          type: "callout",
          icon: "\uD83D\uDCA1",
          content:
            "Press Ctrl+K (or Cmd+K) to search everything. Type / inside a block to open the command menu.",
        },
        { id: "gs-4", type: "heading2", content: "What you can do" },
        {
          id: "gs-5",
          type: "bulleted",
          content: "Create pages and organize them in a nested hierarchy",
        },
        {
          id: "gs-6",
          type: "bulleted",
          content: "Write with headings, lists, quotes, code, tables and more",
        },
        {
          id: "gs-7",
          type: "bulleted",
          content: "Favorite pages for quick access from the sidebar",
        },
        {
          id: "gs-8",
          type: "bulleted",
          content: "Switch between light and dark themes",
        },
        {
          id: "gs-9",
          type: "todo",
          content: "Explore the sidebar to navigate between pages",
          checked: true,
        },
        {
          id: "gs-10",
          type: "todo",
          content: "Create your first page with the + button",
          checked: false,
        },
        {
          id: "gs-11",
          type: "todo",
          content: "Try the search (Ctrl+K)",
          checked: false,
        },
        { id: "gs-12", type: "divider", content: "" },
        { id: "gs-13", type: "heading2", content: "Product status" },
        {
          id: "gs-14",
          type: "table",
          content: "",
          table: {
            cols: 3,
            rows: [
              ["Feature", "Status", "Notes"],
              ["Page editor", "\u2705", "Blocks + slash commands"],
              ["Search", "\u2705", "Ctrl+K global search"],
              ["Templates", "\u2705", "7 starter templates"],
              ["Syncing", "\u23F3", "Planned for a later phase"],
            ],
          },
        },
        {
          id: "gs-15",
          type: "paragraph",
          content: "Have fun exploring \u2014 everything is editable!",
        },
      ],
    },

    {
      id: "projects",
      title: "Projects",
      icon: "\uD83D\uDCC6",
      parentId: null,
      favorite: true,
      createdAt: "2026-06-15",
      updatedAt: "2026-07-21",
      blocks: [
        { id: "prj-1", type: "heading1", content: "Projects" },
        {
          id: "prj-2",
          type: "paragraph",
          content:
            "A home for every active project. Each project has its own page with a description, goals, and a task list.",
        },
        { id: "prj-3", type: "heading2", content: "Portfolio" },
        {
          id: "prj-4",
          type: "todo",
          content: "Project Alpha \u2014 ship the landing page",
          checked: true,
        },
        {
          id: "prj-5",
          type: "todo",
          content: "Project Beta \u2014 API integration",
          checked: false,
        },
        {
          id: "prj-6",
          type: "todo",
          content: "Portfolio refresh \u2014 collect new work samples",
          checked: false,
        },
        { id: "prj-7", type: "divider", content: "" },
        { id: "prj-8", type: "heading3", content: "Notes" },
        {
          id: "prj-9",
          type: "quote",
          content: "Nested pages keep related projects together. Try adding one with the + button.",
        },
      ],
    },

    {
      id: "project-alpha",
      title: "Project Alpha",
      icon: "\uD83D\uDE80",
      parentId: "projects",
      createdAt: "2026-06-20",
      updatedAt: "2026-07-19",
      blocks: [
        { id: "pa-1", type: "heading1", content: "Project Alpha" },
        {
          id: "pa-2",
          type: "paragraph",
          content:
            "Our flagship product launch. The goal is to ship a polished MVP by the end of Q3 2026.",
        },
        { id: "pa-3", type: "heading2", content: "Timeline" },
        {
          id: "pa-4",
          type: "bulleted",
          content: "Phase 1 (June): Research & planning \u2705",
        },
        {
          id: "pa-5",
          type: "bulleted",
          content: "Phase 2 (July): Development \uD83D\uDEE0\uFE0F",
        },
        { id: "pa-6", type: "bulleted", content: "Phase 3 (August): Testing & QA" },
        { id: "pa-7", type: "bulleted", content: "Phase 4 (September): Launch" },
        { id: "pa-8", type: "divider", content: "" },
        { id: "pa-9", type: "heading2", content: "Key metrics" },
        {
          id: "pa-10",
          type: "table",
          content: "",
          table: {
            cols: 2,
            rows: [
              ["Metric", "Target"],
              ["Active users", "10,000"],
              ["Retention", "78%"],
              ["NPS", "62"],
            ],
          },
        },
        {
          id: "pa-11",
          type: "callout",
          icon: "\uD83D\uDD17",
          content: "Demo link goes here. Remember to update it before launch day!",
        },
      ],
    },

    {
      id: "project-beta",
      title: "Project Beta",
      icon: "\uD83C\uDFAF",
      parentId: "projects",
      createdAt: "2026-07-01",
      updatedAt: "2026-07-20",
      blocks: [
        { id: "pb-1", type: "heading1", content: "Project Beta" },
        {
          id: "pb-2",
          type: "paragraph",
          content:
            "An internal tool for streamlining our development workflow. Focus on developer experience and automation.",
        },
        { id: "pb-3", type: "heading2", content: "Requirements" },
        { id: "pb-4", type: "todo", content: "Set up CI/CD pipeline", checked: true },
        { id: "pb-5", type: "todo", content: "Automated test suite", checked: true },
        { id: "pb-6", type: "todo", content: "Deployment dashboard", checked: false },
        { id: "pb-7", type: "todo", content: "Monitoring and alerts", checked: false },
        { id: "pb-8", type: "divider", content: "" },
        { id: "pb-9", type: "heading2", content: "Stack" },
        {
          id: "pb-10",
          type: "code",
          content:
            "frontend:  vanilla JS + HTML/CSS\nbackend:   none (Phase 1)\nstorage:   localStorage\nci:        lint + test on push",
        },
      ],
    },

    {
      id: "meeting-notes",
      title: "Meeting Notes",
      icon: "\uD83D\uDCC5",
      parentId: null,
      createdAt: "2026-06-01",
      updatedAt: "2026-07-21",
      blocks: [
        { id: "mn-1", type: "heading1", content: "Meeting Notes" },
        {
          id: "mn-2",
          type: "paragraph",
          content: "Notes from team syncs, reviews, and one-on-ones.",
        },
      ],
    },

    {
      id: "weekly-sync",
      title: "Weekly Sync",
      icon: "\uD83D\uDCCB",
      parentId: "meeting-notes",
      createdAt: "2026-07-21",
      updatedAt: "2026-07-21",
      blocks: [
        { id: "ws-1", type: "heading1", content: "Weekly Sync" },
        { id: "ws-2", type: "paragraph", content: "Attendees: Alex, Sam, Priya, Dana" },
        { id: "ws-3", type: "heading2", content: "Updates" },
        {
          id: "ws-4",
          type: "bulleted",
          content: "Alex: finished the design tokens \u2014 ready for implementation",
        },
        {
          id: "ws-5",
          type: "bulleted",
          content: "Sam: API integration 80% complete",
        },
        {
          id: "ws-6",
          type: "bulleted",
          content: "Priya: user testing kicked off, feedback is positive",
        },
        {
          id: "ws-7",
          type: "bulleted",
          content: "Dana: monitoring pipeline is live",
        },
        { id: "ws-8", type: "heading2", content: "Action items" },
        { id: "ws-9", type: "todo", content: "Share final design tokens", checked: true },
        { id: "ws-10", type: "todo", content: "Complete API integration by Wednesday", checked: false },
        { id: "ws-11", type: "todo", content: "Compile user testing report", checked: false },
      ],
    },

    {
      id: "learning-plan",
      title: "Learning Plan",
      icon: "\uD83C\uDF93",
      parentId: null,
      favorite: true,
      createdAt: "2026-06-10",
      updatedAt: "2026-07-18",
      blocks: [
        { id: "lp-1", type: "heading1", content: "Learning Plan" },
        {
          id: "lp-2",
          type: "paragraph",
          content:
            "A structured roadmap for learning web development fundamentals in 2026.",
        },
        { id: "lp-3", type: "heading2", content: "Frontend" },
        { id: "lp-4", type: "todo", content: "Semantic HTML", checked: true },
        { id: "lp-5", type: "todo", content: "CSS layout & Flexbox", checked: true },
        { id: "lp-6", type: "todo", content: "CSS Grid", checked: false },
        { id: "lp-7", type: "todo", content: "JavaScript DOM & events", checked: true },
        { id: "lp-8", type: "todo", content: "JavaScript async / fetch", checked: false },
        { id: "lp-9", type: "heading2", content: "Practice projects" },
        { id: "lp-10", type: "numbered", content: "Personal portfolio" },
        { id: "lp-11", type: "numbered", content: "Todo application" },
        { id: "lp-12", type: "numbered", content: "Markdown blog engine" },
      ],
    },

    {
      id: "notes",
      title: "Notes",
      icon: "\uD83D\uDCDD",
      parentId: null,
      createdAt: "2026-05-01",
      updatedAt: "2026-07-20",
      blocks: [
        { id: "nt-1", type: "heading1", content: "Notes" },
        { id: "nt-2", type: "paragraph", content: "Quick scratchpad for thoughts and ideas." },
        { id: "nt-3", type: "divider", content: "" },
        { id: "nt-4", type: "heading3", content: "Ideas" },
        { id: "nt-5", type: "bulleted", content: "Ship a dark mode toggle first" },
        { id: "nt-6", type: "bulleted", content: "Add drag-and-drop page reordering" },
        { id: "nt-7", type: "bulleted", content: "Design a keyboard-first editing flow" },
        { id: "nt-8", type: "callout", icon: "\u23F0", content: "Standup is at 9:30 AM every weekday." },
      ],
    },

    {
      id: "ideas",
      title: "Ideas",
      icon: "\uD83D\uDCA1",
      parentId: "notes",
      createdAt: "2026-07-05",
      updatedAt: "2026-07-16",
      blocks: [
        { id: "id-1", type: "heading1", content: "Ideas" },
        { id: "id-2", type: "heading2", content: "Product ideas" },
        { id: "id-3", type: "numbered", content: "A calendar that schedules itself" },
        { id: "id-4", type: "numbered", content: "A journal with weekly prompts" },
        { id: "id-5", type: "numbered", content: "A habit tracker that forgives you" },
        { id: "id-6", type: "heading2", content: "Quick wins" },
        { id: "id-7", type: "todo", content: "Update portfolio homepage", checked: false },
        { id: "id-8", type: "todo", content: "Publish the blog post on CSS Grid", checked: true },
      ],
    },

    {
      id: "personal",
      title: "Personal",
      icon: "\uD83D\uDC9C",
      parentId: null,
      createdAt: "2026-05-20",
      updatedAt: "2026-07-22",
      blocks: [
        { id: "ps-1", type: "heading1", content: "Personal" },
        {
          id: "ps-2",
          type: "paragraph",
          content: "Goals, reflections, and things worth remembering.",
        },
        { id: "ps-3", type: "heading2", content: "Goals for this quarter" },
        { id: "ps-4", type: "bulleted", content: "Read 6 books" },
        { id: "ps-5", type: "bulleted", content: "Run 3 times a week" },
        { id: "ps-6", type: "bulleted", content: "Ship the Lumen demo" },
        { id: "ps-7", type: "heading2", content: "Favorite quote" },
        {
          id: "ps-8",
          type: "quote",
          content: "The best way to predict the future is to invent it. \u2014 Alan Kay",
        },
      ],
    },

    {
      id: "product-roadmap",
      title: "Product Roadmap",
      icon: "\uD83D\uDCE0",
      parentId: null,
      createdAt: "2026-06-05",
      updatedAt: "2026-07-21",
      blocks: [
        { id: "pr-1", type: "heading1", content: "Product Roadmap" },
        {
          id: "pr-2",
          type: "paragraph",
          content: "Where Lumen is headed. Priorities can change \u2014 that's okay.",
        },
        { id: "pr-3", type: "heading2", content: "This quarter" },
        { id: "pr-4", type: "todo", content: "Phase 1: UI + UX + local persistence", checked: true },
        { id: "pr-5", type: "todo", content: "Phase 2: Cloud sync", checked: false },
        { id: "pr-6", type: "todo", content: "Phase 3: Real-time collaboration", checked: false },
        { id: "pr-7", type: "heading2", content: "Opportunities" },
        {
          id: "pr-8",
          type: "table",
          content: "",
          table: {
            cols: 3,
            rows: [
              ["Feature", "Impact", "Effort"],
              ["Offline mode", "High", "Medium"],
              ["Search", "High", "Low"],
              ["Mobile apps", "Medium", "High"],
              ["API", "Medium", "High"],
            ],
          },
        },
      ],
    },

    {
      id: "archive",
      title: "Archive",
      icon: "\uD83D\uDCE6",
      parentId: null,
      createdAt: "2026-05-01",
      updatedAt: "2026-07-10",
      blocks: [
        { id: "ar-1", type: "heading1", content: "Archive" },
        {
          id: "ar-2",
          type: "paragraph",
          content: "Completed projects and outdated documentation.",
        },
        { id: "ar-3", type: "heading3", content: "Completed" },
        { id: "ar-4", type: "bulleted", content: "Onboarding flow redesign (Q1 2026)" },
        { id: "ar-5", type: "bulleted", content: "Mobile app v1.0 (Q4 2025)" },
      ],
    },
  ],

  /* ------------------------------------------------------------------
     Notifications / Inbox (mock data)
     ------------------------------------------------------------------ */
  notifications: [
    {
      id: "n1",
      icon: "\uD83D\uDCDD",
      html: "<b>Alex</b> mentioned you in <b>Project Alpha</b>",
      time: "5 minutes ago",
      group: "Today",
      pageId: "project-alpha",
      read: false,
    },
    {
      id: "n2",
      icon: "\uD83D\uDCC4",
      html: "A page was shared with you: <b>Product Roadmap</b>",
      time: "2 hours ago",
      group: "Today",
      pageId: "product-roadmap",
      read: false,
    },
    {
      id: "n3",
      icon: "\u2705",
      html: "Task completed: <b>Set up CI/CD pipeline</b>",
      time: "4 hours ago",
      group: "Today",
      pageId: "project-beta",
      read: false,
    },
    {
      id: "n4",
      icon: "\uD83D\uDE80",
      html: "<b>Priya</b> moved <b>Project Alpha</b> to <b>Projects</b>",
      time: "Yesterday",
      group: "Yesterday",
      pageId: "project-alpha",
      read: true,
    },
    {
      id: "n5",
      icon: "\uD83D\uDCAC",
      html: "<b>Sam</b> commented: \u201CLooks great!\u201D",
      time: "Yesterday",
      group: "Yesterday",
      pageId: "weekly-sync",
      read: true,
    },
  ],

  /* ------------------------------------------------------------------
     Templates
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
        { type: "paragraph", content: "A place to organize everything about this project." },
        { type: "heading2", content: "Goal" },
        { type: "paragraph", content: "Describe the outcome you want to achieve." },
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
        { type: "paragraph", content: "Date, attendees, agenda." },
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
        { type: "paragraph", content: "What happened today?" },
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
        { type: "paragraph", content: "Today's tasks." },
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
        { type: "paragraph", content: "The week at a glance." },
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
          type: "table",
          content: "",
          table: {
            cols: 3,
            rows: [
              ["Feature", "Impact", "Effort"],
              ["Search", "High", "Low"],
              ["Mobile", "Medium", "High"],
            ],
          },
        },
      ],
    },
  ],
};
