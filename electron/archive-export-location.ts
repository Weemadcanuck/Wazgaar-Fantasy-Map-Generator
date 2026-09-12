import fs from "node:fs";
import path from "node:path";

export const readLastArchiveDirectory = (filePath: string): string | undefined => {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!value || typeof value !== "object" || !("lastDirectory" in value)) return undefined;
    const { lastDirectory } = value as { lastDirectory?: unknown };
    return typeof lastDirectory === "string" && path.isAbsolute(lastDirectory) ? lastDirectory : undefined;
  } catch {
    return undefined;
  }
};

export const writeLastArchiveDirectory = (filePath: string, directory: string): void => {
  if (!path.isAbsolute(directory)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ lastDirectory: directory }, null, 2)}\n`, "utf8");
};
