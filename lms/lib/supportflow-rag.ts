export type ChunkingStrategy = "fixed" | "paragraph" | "semantic";

export type SupportFlowArticle = {
  id: string;
  title: string;
  category: string;
  sourcePath: string;
  body: string;
};

export type SupportFlowChunk = {
  id: string;
  articleId: string;
  title: string;
  category: string;
  heading: string;
  text: string;
  strategy: ChunkingStrategy;
};

export type RetrievalConfig = {
  topK: number;
  hybridSearch: boolean;
};

export type RetrievalResult = SupportFlowChunk & {
  score: number;
  keywordScore: number;
  conceptScore: number;
  matchedTerms: string[];
};

export const SUPPORTFLOW_ARTICLES: SupportFlowArticle[] = [
  {
    id: "ai-suggestions",
    title: "AI Suggestions",
    category: "Features",
    sourcePath: "features/ai-suggestions.md",
    body: `## How it works
When an agent opens a ticket, SupportFlow analyzes the customer message, searches the knowledge base for relevant articles and past resolutions, and generates a suggested response grounded in company documentation.

## Human review boundary
The agent always has the final say. AI suggestions are recommendations and are never sent automatically. An agent previews, edits, and approves the response before sending it.

## Availability and configuration
AI Suggestions is available on Pro and Enterprise plans. The default confidence threshold is 0.7; lower thresholds show more suggestions with lower precision, while higher thresholds show fewer suggestions. Source attribution is enabled by default.

## Retrieval design
Knowledge-base articles are broken into searchable chunks. The system finds relevant chunks and generates a response using that evidence. Complex or sensitive issues still require human judgment.`,
  },
  {
    id: "live-chat",
    title: "Live Chat",
    category: "Features",
    sourcePath: "features/live-chat.md",
    body: `## Install the widget
Go to Settings, then Channels, then Live Chat. Copy the embed code and paste it before the closing body tag on your website. The workspace ID is required.

## Availability
Set online hours under Settings, Live Chat, Availability. Configure an offline message for visitors. Offline messages automatically create tickets so the team can follow up later.

## Files and follow-up
Customers can share images up to 10 MB and PDF or DOC files up to 25 MB. Every chat is saved as a ticket with the full transcript, and the conversation can continue over email.`,
  },
  {
    id: "knowledge-base",
    title: "Knowledge Base",
    category: "Features",
    sourcePath: "features/knowledge-base.md",
    body: `## Article lifecycle
Knowledge-base articles can be Draft, Published, or Archived. Drafts are visible only to the team. Published articles are visible to customers, while archived articles are hidden but preserved for reference.

## Search and organization
Articles can be grouped by category, tagged, and linked to related articles. Customers receive full-text search, suggestions, and category browsing. Agents can search the knowledge base from a ticket and insert an article link into a reply.

## Measure gaps
Track views, search queries, failed searches, helpful votes, and deflection rate. Failed searches reveal missing content. Review articles monthly and keep one focused topic per article.`,
  },
  {
    id: "first-ticket",
    title: "Handling Your First Ticket",
    category: "Getting Started",
    sourcePath: "getting-started/first-ticket.md",
    body: `## Ticket lifecycle
Every ticket has a status: Open, In Progress, Waiting, Resolved, or Closed. Tickets can arrive through email, live chat, API, or manual creation.

## Reply workflow
Read the full conversation and customer context before responding. AI suggestions on Pro can be previewed, inserted, edited, and then sent by the agent. After replying, update the ticket status to In Progress, Waiting, or Resolved.

## Internal notes
Use the Internal Note tab to discuss a ticket with teammates. Internal notes appear in the conversation timeline but are never visible to customers.`,
  },
  {
    id: "automation-rules",
    title: "Automation Rules",
    category: "Features",
    sourcePath: "features/automation-rules.md",
    body: `## Rule structure
An automation rule combines a trigger, optional conditions, and one or more actions. Triggers include ticket creation, status changes, assignment changes, and time-based events.

## Safe rollout
Start with a narrow condition, test the rule on sample tickets, and inspect the activity log. Avoid overlapping rules that repeatedly update the same field. Disable a rule before changing its trigger or actions.

## Common actions
Rules can assign a team, change priority, add a tag, update status, or send a notification. Use human approval before adding an external or irreversible action to an AI-assisted workflow.`,
  },
  {
    id: "api-authentication",
    title: "API Authentication",
    category: "API",
    sourcePath: "api/authentication.md",
    body: `## Bearer token
Authenticate API requests with a workspace API key in the Authorization header using the Bearer scheme. Never place a secret key in browser code, a public repository, or a shared screenshot.

## Key management
Create separate keys for production and testing. Rotate a key immediately if it is exposed, and grant only the permissions required by the integration.

## Failure response
A missing or invalid key returns an authentication error. Repeated failures should not be retried indefinitely; stop, inspect the credential and environment, then try again.`,
  },
];

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "before", "but", "by", "can", "do", "does", "for", "from", "how", "i", "if", "in", "is", "it", "my", "of", "on", "or", "the", "then", "this", "to", "what", "when", "where", "which", "with", "your",
]);

const CONCEPTS: Record<string, string[]> = {
  ai: ["ai", "assistant", "suggestion", "suggested", "generated", "machine", "recommendation"],
  approval: ["agent", "approve", "approval", "edit", "human", "review", "send", "automatically"],
  automation: ["action", "automation", "condition", "rule", "trigger", "workflow"],
  chat: ["chat", "message", "offline", "online", "transcript", "website", "widget"],
  credentials: ["api", "authentication", "bearer", "credential", "key", "secret", "token"],
  documents: ["article", "content", "documentation", "knowledge", "kb", "published", "source"],
  retrieval: ["chunk", "confidence", "evidence", "precision", "rag", "retrieval", "search"],
  tickets: ["conversation", "customer", "inbox", "reply", "status", "support", "ticket"],
};

function stem(token: string): string {
  let value = token;
  if (value.length > 4 && value.endsWith("ies")) value = `${value.slice(0, -3)}y`;
  else if (value.length > 3 && value.endsWith("s") && !value.endsWith("ss")) value = value.slice(0, -1);
  if (value.length > 5 && value.endsWith("ing")) value = value.slice(0, -3);
  else if (value.length > 4 && value.endsWith("ed")) value = value.slice(0, -2);
  if (value.length > 5 && value.endsWith("ion")) value = value.slice(0, -3);
  return value;
}

function surfaceTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !STOP_WORDS.has(token));
}

function tokens(text: string): string[] {
  return Array.from(new Set(surfaceTokens(text).map(stem)));
}

function conceptsFor(textTokens: string[]): string[] {
  const tokenSet = new Set(textTokens);
  return Object.entries(CONCEPTS)
    .filter(([, aliases]) => aliases.some((alias) => tokenSet.has(stem(alias))))
    .map(([concept]) => concept);
}

function cleanMarkdown(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
}

function fixedChunks(article: SupportFlowArticle, chunkSize: number): SupportFlowChunk[] {
  const words = cleanMarkdown(article.body).split(/\s+/);
  const chunks: SupportFlowChunk[] = [];
  let current: string[] = [];
  let currentLength = 0;
  for (const word of words) {
    const separatorLength = current.length === 0 ? 0 : 1;
    if (current.length > 0 && currentLength + separatorLength + word.length > chunkSize) {
      chunks.push(makeChunk(article, chunks.length, "Fixed window", current.join(" "), "fixed"));
      current = [];
      currentLength = 0;
    }
    const nextSeparatorLength = current.length === 0 ? 0 : 1;
    current.push(word);
    currentLength += nextSeparatorLength + word.length;
  }
  if (current.length > 0) chunks.push(makeChunk(article, chunks.length, "Fixed window", current.join(" "), "fixed"));
  return chunks;
}

function paragraphChunks(article: SupportFlowArticle): SupportFlowChunk[] {
  return article.body
    .split(/\n\s*\n/)
    .map(cleanMarkdown)
    .filter(Boolean)
    .map((text, index) => makeChunk(article, index, "Paragraph", text, "paragraph"));
}

function semanticChunks(article: SupportFlowArticle): SupportFlowChunk[] {
  const sections = article.body.split(/(?=^##\s+)/m).map((section) => section.trim()).filter(Boolean);
  return sections.map((section, index) => {
    const [firstLine, ...rest] = section.split("\n");
    const heading = firstLine.replace(/^##\s+/, "").trim();
    return makeChunk(article, index, heading, cleanMarkdown(rest.join("\n")), "semantic");
  });
}

function makeChunk(article: SupportFlowArticle, index: number, heading: string, text: string, strategy: ChunkingStrategy): SupportFlowChunk {
  return {
    id: `${article.id}-${strategy}-${index + 1}`,
    articleId: article.id,
    title: article.title,
    category: article.category,
    heading,
    text,
    strategy,
  };
}

export function chunkSupportFlowArticles(
  articles: SupportFlowArticle[],
  strategy: ChunkingStrategy,
  chunkSize = 260,
): SupportFlowChunk[] {
  const safeSize = Math.max(140, Math.min(520, chunkSize));
  return articles.flatMap((article) => {
    if (strategy === "fixed") return fixedChunks(article, safeSize);
    if (strategy === "paragraph") return paragraphChunks(article);
    return semanticChunks(article);
  });
}

export function retrieveSupportFlowChunks(
  chunks: SupportFlowChunk[],
  query: string,
  config: RetrievalConfig,
): RetrievalResult[] {
  const querySurfaceTokens = surfaceTokens(query);
  const queryTokens = tokens(query);
  const queryConcepts = conceptsFor(queryTokens);
  const topK = Math.max(1, Math.min(8, Math.round(config.topK)));

  return chunks
    .map((chunk) => {
      const bodyTokens = tokens(`${chunk.title} ${chunk.heading} ${chunk.text}`);
      const bodySet = new Set(bodyTokens);
      const matchedTerms = Array.from(new Set(
        querySurfaceTokens.filter((token) => bodySet.has(stem(token))),
      ));
      const keywordScore = queryTokens.length === 0 ? 0 : matchedTerms.length / queryTokens.length;
      const bodyConcepts = new Set(conceptsFor(bodyTokens));
      const conceptMatches = queryConcepts.filter((concept) => bodyConcepts.has(concept));
      const conceptScore = queryConcepts.length === 0 ? 0 : conceptMatches.length / queryConcepts.length;
      const titleTokens = new Set(tokens(`${chunk.title} ${chunk.heading}`));
      const titleScore = queryTokens.length === 0 ? 0 : queryTokens.filter((token) => titleTokens.has(token)).length / queryTokens.length;
      const score = config.hybridSearch
        ? (keywordScore * 0.7) + (conceptScore * 0.2) + (titleScore * 0.1)
        : (keywordScore * 0.9) + (titleScore * 0.1);

      return {
        ...chunk,
        score: Number(score.toFixed(4)),
        keywordScore: Number(keywordScore.toFixed(4)),
        conceptScore: Number(conceptScore.toFixed(4)),
        matchedTerms,
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, topK);
}

export function groundedSupportFlowDraft(query: string, results: RetrievalResult[]): string {
  const useful = results
    .filter((result) => result.score >= 0.12 && result.keywordScore > 0)
    .slice(0, 2);
  if (useful.length === 0) {
    return `I could not find enough SupportFlow evidence to answer “${query}”. Ask a more specific question or add the missing documentation.`;
  }
  const evidence = useful.map((result) => {
    const sentences = result.text.match(/[^.!?]+[.!?]+/g) ?? [result.text];
    return `${sentences.slice(0, 2).join(" ").trim()} [${result.title} · ${result.heading}]`;
  });
  return evidence.join("\n\n");
}
