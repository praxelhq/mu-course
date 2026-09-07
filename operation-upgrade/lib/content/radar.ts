/// The take-home. Names are names to search rather than links — the five
/// newsletter URLs are the only ones the source supplies, and inventing the
/// rest would ship link rot into a classroom.
export const AI_RADAR = {
  people: [
    { name: "Ethan Mollick", lens: "Practical AI at work" },
    { name: "Andrew Ng", lens: "Practical AI at work" },
    { name: "Simon Willison", lens: "Builder" },
    { name: "Andrej Karpathy", lens: "Builder" },
    { name: "Arvind Narayanan", lens: "Sceptic" },
    { name: "Sayash Kapoor", lens: "Sceptic" },
    { name: "Lenny Rachitsky", lens: "Product and growth" },
  ],
  newsletters: [
    { name: "One Useful Thing", url: "https://www.oneusefulthing.org/", note: "What AI actually means for work" },
    { name: "The Batch", url: "https://www.deeplearning.ai/the-batch/", note: "A manageable industry update" },
    { name: "AI as Normal Technology", url: "https://www.aisnakeoil.com/", note: "Evidence, and a counterweight to hype" },
    { name: "Lenny's Newsletter", url: "https://www.lennysnewsletter.com/", note: "Product, growth, company building" },
    { name: "Latent Space", url: "https://www.latent.space/", note: "AI engineering and infrastructure" },
  ],
  podcasts: ["Lenny's Podcast", "The Cognitive Revolution", "Latent Space", "No Priors", "Hard Fork", "Dwarkesh Podcast"],
  organisations: [
    { group: "Model labs", names: ["OpenAI", "Anthropic", "Google DeepMind", "Meta AI"] },
    { group: "Builder ecosystem", names: ["Hugging Face", "Vercel", "Cursor", "GitHub"] },
    { group: "Applied AI", names: ["ElevenLabs", "Clay", "Perplexity"] },
    { group: "India", names: ["IndiaAI", "AI4Bharat", "Sarvam AI"] },
  ],
} as const;

export const COMMITMENT_PROMPT =
  "Write it down while you are still annoyed about something. A commitment you make in this room, about work you actually do, is the only part of today that survives contact with next week.";

export const CLOSING_QUESTIONS = [
  "What can you now do that you could not do before this course?",
  "Where will you no longer trust AI without checking?",
  "Which of the things you built are you most likely to use again?",
] as const;
