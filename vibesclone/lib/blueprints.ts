export type CloneVerdict = "Highly buildable" | "Buildable with trade-offs" | "Focused version only";

export type Blueprint = {
  slug: string;
  name: string;
  sourceUrl: string;
  category: string;
  tagline: string;
  verdict: CloneVerdict;
  cloneabilityScore: number;
  effort: string;
  buildTime: string;
  summary: string;
  coreFeatures: string[];
  keyFlows: { name: string; steps: string[] }[];
  hardParts: string[];
  nicheAngles: { niche: string; usp: string }[];
  scopeCuts: string[];
  basePrompt: string;
  faq: { question: string; answer: string }[];
};

function prompt(name: string, focus: string, entities: string, workflow: string): string {
  return `Build a focused, production-quality ${name}-inspired product for a clearly named niche. Recreate the product logic, not its branding, copy, or visual identity. The first release must optimize for ${focus}. Model ${entities} as the core domain entities and make ${workflow} the complete vertical slice. Include authentication, empty and error states, responsive navigation, accessible controls, durable persistence, and seed data for a convincing demo. Keep advanced integrations behind explicit interfaces and do not add marketplace, enterprise administration, or collaboration complexity until the core workflow passes end to end. Before coding, state the chosen niche, USP, primary actor, non-goals, and acceptance checks so every later feature can be traced back to the approved product definition.`;
}

export const blueprints: readonly Blueprint[] = [
  {
    slug: "linear", name: "Linear", sourceUrl: "https://linear.app", category: "Project management", tagline: "Fast issue tracking without the enterprise surface area", verdict: "Buildable with trade-offs", cloneabilityScore: 78, effort: "Medium", buildTime: "2–4 focused weeks",
    summary: "A credible Linear-inspired product is an opinionated issue tracker with keyboard-fast capture, cycles, views, and a calm information hierarchy. The hard part is not CRUD; it is making every state transition feel instant and coherent across a team.",
    coreFeatures: ["Workspace and team setup", "Issue capture with status, priority, assignee, and labels", "Cycle planning and backlog views", "Saved filters and command-style navigation", "Activity history on every issue"],
    keyFlows: [{ name: "Capture work", steps: ["Open quick create", "Add issue context", "Assign team and priority", "Save without losing keyboard focus"] }, { name: "Plan a cycle", steps: ["Review backlog", "Select candidate issues", "Set cycle capacity", "Publish cycle"] }, { name: "Move work", steps: ["Open issue", "Change status", "Record activity", "Update every relevant view"] }],
    hardParts: ["Perceived speed across dense lists and keyboard interactions", "Reliable real-time collaboration and integration depth", "A flexible query system that remains understandable"],
    nicheAngles: [{ niche: "Video production studios", usp: "Shot and review stages replace generic issue states" }, { niche: "Recruiting agencies", usp: "Candidate-placement cycles with client SLAs" }, { niche: "Compliance teams", usp: "Evidence-first work items with immutable approvals" }],
    scopeCuts: ["No Git provider sync in the first release", "No custom workflow builder", "No multiplayer presence or enterprise SSO"],
    basePrompt: prompt("Linear", "speed, clarity, and a single team workflow", "workspaces, teams, issues, cycles, labels, and activity events", "capture an issue, plan it into a cycle, move it through status, and see the change reflected everywhere"),
    faq: [{ question: "Can a small team build a Linear alternative?", answer: "Yes, if it narrows the audience and workflow. A general-purpose replacement with Linear's polish and integration depth is a much larger product." }, { question: "What should the first version omit?", answer: "Git sync, custom automations, enterprise administration, and real-time multiplayer are sensible cuts until issue capture and cycle execution are excellent." }],
  },
  {
    slug: "notion", name: "Notion", sourceUrl: "https://www.notion.so", category: "Knowledge management", tagline: "A structured workspace for one repeatable job", verdict: "Focused version only", cloneabilityScore: 61, effort: "High", buildTime: "4–8 focused weeks",
    summary: "The buildable version of Notion is not an infinite tool for every team. It is a block editor plus one structured database view, shaped around a narrow workflow where templates and relations remove repeated coordination.",
    coreFeatures: ["Nested pages and workspace navigation", "Block-based text editing", "One structured database with custom properties", "Table and board views", "Templates and lightweight sharing"],
    keyFlows: [{ name: "Create knowledge", steps: ["Create a page", "Add and reorder blocks", "Apply a template", "Publish to the workspace"] }, { name: "Structure work", steps: ["Create a database item", "Set properties", "Filter a view", "Open the item as a page"] }, { name: "Find context", steps: ["Search titles and content", "Open a result", "Follow linked records", "Return to recent work"] }],
    hardParts: ["A robust editor with selection, paste, undo, and mobile behavior", "Flexible schema changes without corrupting content", "Permissions and collaborative editing at scale"],
    nicheAngles: [{ niche: "Independent legal teams", usp: "Matters, evidence, deadlines, and client-ready portals" }, { niche: "Course creators", usp: "Curriculum blocks tied to production status and assets" }, { niche: "Restaurant operators", usp: "Location playbooks with recurring audit views" }],
    scopeCuts: ["One database type and two views only", "No public template marketplace", "No collaborative cursors or arbitrary formulas"],
    basePrompt: prompt("Notion", "structured knowledge for one repeatable operational job", "workspaces, pages, blocks, databases, properties, views, and templates", "create a page from a template, capture structured records, switch views, and retrieve the right context"),
    faq: [{ question: "Is a full Notion clone realistic?", answer: "Not as a first product. A niche workspace with a dependable editor and one structured workflow is realistic and often more valuable." }, { question: "Which feature is most expensive?", answer: "The editor becomes expensive quickly because selection, paste, undo, embeds, collaboration, and mobile behavior interact." }],
  },
  {
    slug: "calendly", name: "Calendly", sourceUrl: "https://calendly.com", category: "Scheduling", tagline: "Rules-based booking for one high-value meeting type", verdict: "Highly buildable", cloneabilityScore: 88, effort: "Medium", buildTime: "2–3 focused weeks",
    summary: "A Calendly-inspired product is a rules engine wrapped in an unusually low-friction booking flow. The best niche versions win by knowing why a meeting happens and collecting the exact context needed before it starts.",
    coreFeatures: ["Host availability and buffers", "Event types with duration and questions", "Public booking page with timezone handling", "Confirmation, reschedule, and cancellation", "Calendar connection boundary and notification hooks"],
    keyFlows: [{ name: "Define availability", steps: ["Connect or select a calendar", "Set weekly windows", "Add buffers and notice", "Preview open slots"] }, { name: "Book", steps: ["Choose event type", "Pick a timezone-aware slot", "Answer intake questions", "Receive confirmation"] }, { name: "Change a booking", steps: ["Open secure manage link", "Choose reschedule or cancel", "Recompute availability", "Notify both parties"] }],
    hardParts: ["Timezone, daylight-saving, buffer, and conflict edge cases", "Reliable external calendar writes and retries", "Preventing double booking under concurrent requests"],
    nicheAngles: [{ niche: "Immigration advisors", usp: "Eligibility intake and document checklist before booking" }, { niche: "Home-service businesses", usp: "Travel zones and job-duration-aware availability" }, { niche: "University mentors", usp: "Office hours, topic routing, and fair-use limits" }],
    scopeCuts: ["Start with one calendar provider", "No routing forms or pooled teams", "No payment collection in the base release"],
    basePrompt: prompt("Calendly", "conflict-free booking and excellent timezone handling", "users, event types, availability rules, booking holds, bookings, invitees, and notifications", "configure availability, expose valid slots, reserve one safely, and let the invitee reschedule through a secure link"),
    faq: [{ question: "What makes scheduling difficult?", answer: "The visible form is simple; calendar conflicts, timezones, daylight-saving shifts, concurrent holds, and external API failures create the real complexity." }, { question: "What niche advantage works best?", answer: "Collect and use context specific to the meeting, rather than competing only on generic calendar convenience." }],
  },
  {
    slug: "typeform", name: "Typeform", sourceUrl: "https://www.typeform.com", category: "Forms", tagline: "Conversational data collection with an opinionated outcome", verdict: "Highly buildable", cloneabilityScore: 90, effort: "Low–medium", buildTime: "1–3 focused weeks",
    summary: "A Typeform-inspired product is a form schema, a one-question-at-a-time runner, and a useful response workspace. A niche version becomes defensible when answers drive a decision or deliverable instead of ending in a spreadsheet.",
    coreFeatures: ["Form builder with core question types", "Logic jumps and required rules", "Responsive conversational runner", "Response table and individual response view", "Share link, completion screen, and export"],
    keyFlows: [{ name: "Build a form", steps: ["Create a form", "Add and order questions", "Set validation and logic", "Publish a version"] }, { name: "Respond", steps: ["Open public link", "Answer one question at a time", "Follow conditional path", "Submit and see completion"] }, { name: "Act on responses", steps: ["Filter submissions", "Open response detail", "Assign an outcome", "Export or trigger a notification"] }],
    hardParts: ["A builder that remains fast as conditional logic grows", "Versioning published forms without breaking existing responses", "Spam prevention and accessible keyboard behavior"],
    nicheAngles: [{ niche: "B2B agencies", usp: "Discovery answers become a draft statement of work" }, { niche: "Nutrition coaches", usp: "Intake produces a structured risk and habit brief" }, { niche: "Grant programs", usp: "Eligibility logic and reviewer-ready application packets" }],
    scopeCuts: ["Six question types rather than a plugin catalog", "No collaborative editing", "No native automation marketplace"],
    basePrompt: prompt("Typeform", "fast conversational completion and actionable response review", "forms, versions, questions, choices, logic rules, responses, answers, and outcomes", "build and publish a conditional form, complete it on mobile, and turn the response into a useful outcome"),
    faq: [{ question: "Is a Typeform-like MVP fast to build?", answer: "Yes, if question types and branching are deliberately limited. The response outcome can differentiate the product more than a large builder surface." }, { question: "What should be versioned?", answer: "Published question order, wording, choices, and logic need a stable version so historical answers remain interpretable." }],
  },
  {
    slug: "loom", name: "Loom", sourceUrl: "https://www.loom.com", category: "Async video", tagline: "Record, share, and resolve one kind of async conversation", verdict: "Buildable with trade-offs", cloneabilityScore: 69, effort: "High", buildTime: "3–6 focused weeks",
    summary: "A Loom-inspired product is a recording handoff, durable video processing, a fast watch page, and contextual feedback. Narrowing the communication use case makes the surrounding workflow more defensible than the recorder itself.",
    coreFeatures: ["Browser screen and microphone capture", "Upload state and processing lifecycle", "Shareable watch page", "Timestamped comments and reactions", "Workspace library with privacy controls"],
    keyFlows: [{ name: "Record", steps: ["Choose sources", "Grant permissions", "Record and pause", "Stop and upload safely"] }, { name: "Share", steps: ["Wait for playable state", "Set access", "Copy a share link", "Track first view"] }, { name: "Resolve feedback", steps: ["Watch at a timestamp", "Leave contextual comment", "Notify owner", "Mark thread resolved"] }],
    hardParts: ["Reliable capture across browsers and devices", "Large resumable uploads, transcoding, thumbnails, and playback", "Storage and bandwidth economics"],
    nicheAngles: [{ niche: "QA teams", usp: "Bug videos become reproducible tickets with environment data" }, { niche: "Interior designers", usp: "Room walkthroughs anchor client decisions and approvals" }, { niche: "Sales engineers", usp: "Demo chapters tied to buyer questions and follow-up tasks" }],
    scopeCuts: ["Web recording only", "One processed playback format", "No desktop app, AI avatar, or editing suite"],
    basePrompt: prompt("Loom", "a resilient record-upload-watch-feedback loop", "workspaces, recordings, media assets, processing jobs, share grants, comments, and view events", "capture a short browser recording, resume its upload, publish a secure watch page, and leave timestamped feedback"),
    faq: [{ question: "Can the recorder be built in a browser?", answer: "Yes for a focused release, though browser support, permissions, resumable uploads, and media processing require careful failure handling." }, { question: "Where does a niche version win?", answer: "It should turn the recording into domain work—a bug, approval, coaching review, or buyer follow-up—rather than stopping at video sharing." }],
  },
  {
    slug: "linktree", name: "Linktree", sourceUrl: "https://linktr.ee", category: "Creator tools", tagline: "A conversion page for one creator business model", verdict: "Highly buildable", cloneabilityScore: 95, effort: "Low", buildTime: "3–7 focused days",
    summary: "A Linktree-inspired product is straightforward to build: profile, ordered links, a public page, theming, and click analytics. Its differentiation must come from conversion features for a specific creator or business category.",
    coreFeatures: ["Profile and public slug", "Ordered links with active schedules", "Responsive theme system", "Click analytics", "Simple call-to-action blocks"],
    keyFlows: [{ name: "Publish a page", steps: ["Claim a slug", "Add profile details", "Add and reorder links", "Choose theme and publish"] }, { name: "Visit and convert", steps: ["Open fast public page", "Choose a relevant action", "Record anonymous click", "Continue to destination"] }, { name: "Improve performance", steps: ["Review link clicks", "Compare positions", "Edit call to action", "Republish"] }],
    hardParts: ["Abuse, phishing, unsafe destinations, and slug squatting", "Fast global delivery and trustworthy analytics", "Building durable distribution beyond a commodity page builder"],
    nicheAngles: [{ niche: "Independent musicians", usp: "Release campaigns, pre-save links, and show dates" }, { niche: "Real-estate agents", usp: "Listings, WhatsApp inquiry, and neighborhood guides" }, { niche: "Workshop instructors", usp: "Upcoming sessions, seat urgency, and alumni outcomes" }],
    scopeCuts: ["A constrained set of blocks", "No storefront or payouts", "No custom code or marketplace themes"],
    basePrompt: prompt("Linktree", "fast mobile conversion for one creator business model", "profiles, slugs, links, blocks, themes, schedules, and click events", "claim a public page, arrange conversion blocks, publish instantly, and learn which action visitors choose"),
    faq: [{ question: "Why is this highly cloneable?", answer: "The core data and flows are small. The real product decision is choosing a niche where domain-specific conversion blocks justify switching." }, { question: "What is the main risk?", answer: "A generic link page is a commodity. Safety controls, fast delivery, and a niche conversion advantage matter more than adding themes." }],
  },
  {
    slug: "trello", name: "Trello", sourceUrl: "https://trello.com", category: "Project management", tagline: "A visual workflow board shaped around one operating rhythm", verdict: "Highly buildable", cloneabilityScore: 86, effort: "Medium", buildTime: "2–3 focused weeks",
    summary: "A Trello-inspired product is a board, ordered lists, draggable cards, card detail, and an activity trail. A niche version should encode the domain's stages and card fields instead of becoming another blank board.",
    coreFeatures: ["Boards, lists, and ordered cards", "Drag-and-drop movement", "Card detail with fields, checklist, and comments", "Members and labels", "Activity history and simple filters"],
    keyFlows: [{ name: "Set up workflow", steps: ["Create board from niche template", "Name stages", "Invite members", "Define card fields"] }, { name: "Move work", steps: ["Create card", "Add owner and checklist", "Drag to next stage", "Record activity"] }, { name: "Review progress", steps: ["Filter the board", "Open blocked cards", "Resolve checklist items", "Archive completed work"] }],
    hardParts: ["Conflict-safe ordering during drag and drop", "Keeping dense boards usable on mobile", "Notifications that are useful rather than noisy"],
    nicheAngles: [{ niche: "Wedding planners", usp: "Vendor, payment, and event-milestone cards" }, { niche: "Podcast teams", usp: "Episode pipeline with guest and asset readiness" }, { niche: "Home renovation", usp: "Room boards tied to decisions, quotes, and approvals" }],
    scopeCuts: ["One opinionated board template per niche", "No automation language", "No power-up marketplace or enterprise administration"],
    basePrompt: prompt("Trello", "a visual operating rhythm with safe card ordering", "workspaces, boards, lists, cards, positions, members, checklists, labels, and activity events", "create a domain board, move a card through stages, preserve its history, and review blocked work"),
    faq: [{ question: "What makes a Trello clone useful?", answer: "A niche board should arrive with the right stages, card fields, and review rhythm, so the user starts operating rather than configuring." }, { question: "Is drag and drop enough?", answer: "No. Reliable ordering, mobile behavior, activity history, and domain-specific card detail determine whether teams can trust it." }],
  },
  {
    slug: "buffer", name: "Buffer", sourceUrl: "https://buffer.com", category: "Social publishing", tagline: "A calm publishing queue for one content workflow", verdict: "Buildable with trade-offs", cloneabilityScore: 72, effort: "Medium–high", buildTime: "3–6 focused weeks",
    summary: "A Buffer-inspired product is a content queue, channel-aware composer, scheduling engine, publisher, and failure inbox. A narrow audience can justify the product through workflow guidance, while provider APIs remain the largest operational dependency.",
    coreFeatures: ["Connected channel abstraction", "Draft and channel-aware composer", "Publishing queue and calendar", "Scheduled job lifecycle with retries", "Post history and failure recovery"],
    keyFlows: [{ name: "Connect a channel", steps: ["Choose provider", "Authorize account", "Select destination", "Verify capabilities"] }, { name: "Schedule content", steps: ["Create draft", "Adapt channel variants", "Choose queue slot", "Confirm schedule"] }, { name: "Recover a failure", steps: ["Receive provider error", "Classify retryability", "Notify owner", "Edit or retry safely"] }],
    hardParts: ["Changing provider APIs, reviews, permissions, and quotas", "Exactly-once publishing behavior around ambiguous failures", "Channel-specific media rules and analytics definitions"],
    nicheAngles: [{ niche: "Franchise teams", usp: "Brand-approved local content with location overrides" }, { niche: "B2B founder-led sales", usp: "Idea-to-LinkedIn queue with CRM follow-up intent" }, { niche: "Nonprofits", usp: "Campaign calendars tied to volunteer and donor actions" }],
    scopeCuts: ["One social provider at launch", "Text and single-image posts only", "No listening, inbox, or advanced analytics suite"],
    basePrompt: prompt("Buffer", "safe scheduled publishing and visible recovery", "users, channels, provider grants, drafts, variants, queue slots, publish jobs, attempts, and outcomes", "connect one channel, schedule a compatible post, publish it once, and recover clearly when the provider rejects it"),
    faq: [{ question: "Can a small team build a Buffer alternative?", answer: "A single-provider, niche-focused scheduler is feasible. Supporting many networks, formats, analytics systems, and changing approvals is the expensive part." }, { question: "What is the first reliability requirement?", answer: "The product must make every scheduled post's state clear and avoid duplicate publishing when provider responses are ambiguous." }],
  },
] as const;

function normalizedHost(value: string): string | null {
  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function findBlueprint(input: string): Blueprint | undefined {
  const query = input.trim().toLowerCase();
  if (!query) return undefined;
  const host = normalizedHost(query);
  return blueprints.find((item) => item.slug === query || item.name.toLowerCase() === query || (host && normalizedHost(item.sourceUrl) === host));
}

export function relatedBlueprints(blueprint: Blueprint, limit = 3): Blueprint[] {
  return [...blueprints]
    .filter((item) => item.slug !== blueprint.slug)
    .sort((a, b) => Number(b.category === blueprint.category) - Number(a.category === blueprint.category) || b.cloneabilityScore - a.cloneabilityScore)
    .slice(0, limit);
}

export const blueprintCategories = [...new Set(blueprints.map((item) => item.category))].sort();
