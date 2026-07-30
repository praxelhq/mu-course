import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const lmsRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(lmsRoot, "..");

const evaluatorOnlyPaths = [
  "lms/private/",
  "lms/output/instructor/",
  "lms/course/session-03/visualization-quiz.md",
  "lms/course/session-04/06-lovable-prompt-plan-script.md",
  "lms/course/session-04/12-instructor-quiz-bank.md",
  "lms/course/session-05/assessment/surprise-quiz-key.md",
  "lms/course/session-05/fixtures/evaluator-bundle.v1.json",
  "lms/course/session-05/fixtures/expected-results.json",
  "lms/course/session-05/fixtures/operations/expected-results.json",
  "lms/course/session-05/fixtures/revenue/expected-results.json",
  "lms/course/session-05/workflow-packs/preferred-instructor-build.md",
];

const requiredPrivateFiles = [
  ...evaluatorOnlyPaths.filter((path) => !path.endsWith("/")),
  "lms/output/instructor/quizzes/INSTRUCTOR_ONLY_quiz-keys.v1.json",
  "lms/output/instructor/quizzes/import-package-manifest.v1.json",
  "lms/output/instructor/quizzes/validation-report.v1.json",
];

function git(...args) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const tracked = git("ls-files", "--", ...evaluatorOnlyPaths)
  .split("\n")
  .filter(Boolean);
if (tracked.length > 0) {
  console.error("Evaluator boundary failed: private evaluator assets are tracked by Git:");
  for (const path of tracked) console.error(`- ${path}`);
  process.exit(1);
}

const dockerIgnore = readFileSync(resolve(lmsRoot, ".dockerignore"), "utf8")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
const requiredDockerPatterns = evaluatorOnlyPaths.map((path) => path.replace(/^lms\//, ""));
const missingDockerPatterns = requiredDockerPatterns.filter(
  (path) => !dockerIgnore.includes(path),
);
if (missingDockerPatterns.length > 0) {
  console.error("Evaluator boundary failed: .dockerignore misses evaluator-only paths:");
  for (const path of missingDockerPatterns) console.error(`- ${path}`);
  process.exit(1);
}

if (process.argv.includes("--require-private")) {
  const missingPrivateFiles = requiredPrivateFiles.filter(
    (path) => !existsSync(resolve(repoRoot, path)),
  );
  if (missingPrivateFiles.length > 0) {
    console.error("Evaluator boundary failed: secure release inputs are missing:");
    for (const path of missingPrivateFiles) console.error(`- ${path}`);
    process.exit(1);
  }
}

console.log(
  `Evaluator boundary passed: ${evaluatorOnlyPaths.length} protected paths are untracked and excluded from Docker.`,
);
