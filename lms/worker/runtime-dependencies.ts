import { execFile } from "node:child_process";

const TESSERACT_PROBE_TIMEOUT_MS = 5_000;
const TESSERACT_PROBE_MAX_BYTES = 32 * 1_024;

export type WorkerRuntimeCapabilities = {
  localOcrEnglish: true;
};

export type ListTesseractLanguages = () => Promise<string[]>;

function listInstalledTesseractLanguages(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    execFile(
      "tesseract",
      ["--list-langs"],
      {
        encoding: "utf8",
        timeout: TESSERACT_PROBE_TIMEOUT_MS,
        maxBuffer: TESSERACT_PROBE_MAX_BYTES,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(new Error("Local OCR executable probe failed"));
          return;
        }
        resolve(stdout.split(/\s+/).filter(Boolean));
      },
    );
  });
}

/** Startup gate for dependencies required by local evidence preflight. */
export async function verifyWorkerRuntimeDependencies(
  listLanguages: ListTesseractLanguages = listInstalledTesseractLanguages,
): Promise<WorkerRuntimeCapabilities> {
  const languages = await listLanguages();
  if (!languages.includes("eng")) {
    throw new Error("Local OCR English language data is unavailable");
  }
  return { localOcrEnglish: true };
}
