import { readFileSync } from "node:fs";

export function readMapFixture(name: string): string[] {
  const text = readFileSync(new URL(name, import.meta.url), "utf8");
  // Git-normalized fixtures need section boundaries restored around the multiline SVG.
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const svgStart = lines.findIndex(line => line.trimStart().startsWith("<svg"));
  const gridStart = lines.findIndex((line, i) => i > svgStart && line.startsWith('{"spacing"'));
  if (svgStart !== 5 || gridStart < 0) throw new Error(`Invalid map fixture: ${name}`);
  return [...lines.slice(0, svgStart), lines.slice(svgStart, gridStart).join("\n"), ...lines.slice(gridStart)];
}
