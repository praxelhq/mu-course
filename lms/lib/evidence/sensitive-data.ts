export type SensitiveDetector =
  | "secret-token"
  | "sensitive-key"
  | "email"
  | "phone"
  | "prompt-injection"
  | "image-unreadable"
  | "blueprint-invalid"
  | "evidence-integrity"
  | "evidence-unavailable"
  | "text-unreadable"
  | "mime-unsupported";

export type SensitiveFinding = {
  detector: SensitiveDetector;
  role: string;
  /** UTF-16 offset into locally scanned text. Never include matched content. */
  offset: number;
};

const REDACTED_VALUES = new Set(["", "redacted", "[redacted]", "***", "xxxxx", "dummy"]);
const NORMALIZED_SENSITIVE_KEYS = new Set([
  "accesstoken",
  "apikey",
  "authorization",
  "authtoken",
  "awsaccesskeyid",
  "awssecretaccesskey",
  "bearertoken",
  "clientcredentials",
  "clientsecret",
  "credentials",
  "databaseurl",
  "githubtoken",
  "gitlabtoken",
  "googleapikey",
  "idtoken",
  "oauthaccesstoken",
  "oauthtoken",
  "openaiapikey",
  "password",
  "privatekey",
  "proxyauthorization",
  "refreshtoken",
  "secret",
  "secretaccesskey",
  "serviceaccountkey",
  "signingsecret",
  "slacktoken",
  "slackwebhookurl",
  "token",
  "webhooksecret",
  "webhookurl",
]);
const SENSITIVE_KEY_SUFFIXES = [
  "apikey",
  "accesstoken",
  "refreshtoken",
  "secretaccesskey",
  "clientsecret",
  "signingsecret",
  "webhooksecret",
  "privatekey",
];
const STRUCTURED_ASSIGNMENT =
  /(?:^|[\s,{;])(["']?)([A-Za-z][A-Za-z0-9_.-]{0,127})\1\s*[:=]\s*(?:"([^"\r\n]*)"|'([^'\r\n]*)'|([^\s,}\]\r\n]+))/gm;
const SECRET_TOKEN_PATTERNS = [
  /\b(?:sk|pk)_(?:live|test|prod)_[A-Za-z0-9_-]{12,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh(?:p|o|u|s|r)_[A-Za-z0-9._-]{20,255}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,255}\b/g,
  /\b(?:xox[a-z]|xapp|xwfp)-[A-Za-z0-9-]{10,255}\b/gi,
  /\bxoxe\.[A-Za-z0-9.-]{10,255}\b/gi,
  /\bAIza[A-Za-z0-9_-]{35}\b/g,
  /https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_-]{6,}\/[A-Za-z0-9_-]{6,}\/[A-Za-z0-9_-]{12,}/g,
  /\b(?:sk-(?:proj|ant)-|glpat-|npm_)[A-Za-z0-9_-]{16,255}\b/g,
  /-----BEGIN (?:(?:ENCRYPTED|RSA|EC|DSA|OPENSSH) )?PRIVATE KEY-----|-----BEGIN PGP PRIVATE KEY BLOCK-----/g,
];
const RESERVED_DEMO_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.net",
  "example.org",
  "example.test",
]);

function isReservedDemoEmailDomain(domain: string): boolean {
  return (
    RESERVED_DEMO_EMAIL_DOMAINS.has(domain) ||
    [...RESERVED_DEMO_EMAIL_DOMAINS].some((reserved) => domain.endsWith(`.${reserved}`)) ||
    domain.endsWith(".test")
  );
}

function addFinding(
  findings: SensitiveFinding[],
  detector: SensitiveDetector,
  role: string,
  offset: number,
): void {
  if (!findings.some((item) => item.detector === detector && item.role === role && item.offset === offset)) {
    findings.push({ detector, role, offset });
  }
}

function forMatches(text: string, pattern: RegExp, visit: (match: RegExpExecArray) => void): void {
  pattern.lastIndex = 0;
  for (;;) {
    const match = pattern.exec(text);
    if (!match) return;
    visit(match);
    if (match[0].length === 0) pattern.lastIndex += 1;
  }
}

function normalizedCredentialKey(key: string): string {
  return key.replace(/[^A-Za-z0-9]/g, "").toLocaleLowerCase("en-US");
}

function isSensitiveStructuredKey(key: string): boolean {
  const normalized = normalizedCredentialKey(key);
  return (
    NORMALIZED_SENSITIVE_KEYS.has(normalized) ||
    SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
  );
}

/** Local scanner. Its return type structurally cannot contain the match. */
export function scanSensitiveText(text: string, role: string): SensitiveFinding[] {
  const findings: SensitiveFinding[] = [];

  for (const pattern of SECRET_TOKEN_PATTERNS) {
    forMatches(text, pattern, (match) =>
      addFinding(findings, "secret-token", role, match.index),
    );
  }

  forMatches(text, STRUCTURED_ASSIGNMENT, (match) => {
    const key = match[2] ?? "";
    if (!isSensitiveStructuredKey(key)) return;
    const value = (match[3] ?? match[4] ?? match[5] ?? "")
      .trim()
      .toLocaleLowerCase("en-US");
    if (REDACTED_VALUES.has(value)) return;
    const keyOffset = match[0].indexOf(key);
    addFinding(
      findings,
      "sensitive-key",
      role,
      match.index + Math.max(0, keyOffset),
    );
  });

  forMatches(
    text,
    /\b[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})\b/gi,
    (match) => {
      const domain = (match[1] ?? "").toLocaleLowerCase("en-US");
      if (!isReservedDemoEmailDomain(domain)) {
        addFinding(findings, "email", role, match.index);
      }
    },
  );

  forMatches(text, /(?:\+?\d[\s().-]*){10,15}/g, (match) => {
    const digits = match[0].replace(/\D/g, "");
    if (digits.length >= 10 && digits.length <= 15) addFinding(findings, "phone", role, match.index);
  });

  forMatches(
    text,
    /\b(?:ignore|disregard)\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b|\baward\s+(?:me\s+)?full\s+marks\b|\boverride\s+(?:the\s+)?rubric\b/gi,
    (match) => addFinding(findings, "prompt-injection", role, match.index),
  );

  return findings.sort((a, b) => a.offset - b.offset || a.detector.localeCompare(b.detector));
}

export function buildRedactedRepairFeedback(findings: SensitiveFinding[]): string {
  const lines = findings.map(
    (finding) =>
      `- ${finding.role}: ${finding.detector} at offset ${finding.offset}. Remove or redact it, then upload a clean replacement.`,
  );
  return [
    "Evidence was withheld before AI processing because local safety checks need repair.",
    ...lines,
    "The detected value is intentionally not shown. Rotate any real credential before resubmitting.",
  ].join("\n");
}
