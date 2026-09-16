import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { buildArchiveExportPlan } from "../src/services/io/archive-export.ts";

const MANIFEST_PATH = "azgaar-archive-manifest.json";

const usage = () => {
  console.error(
    "Usage: npm run export:archive -- <full-json> <output-directory> <world-id> [--dry-run]"
  );
};

const [inputArgument, outputArgument, worldIdArgument, ...flags] = process.argv.slice(2);
if (!inputArgument || !outputArgument || !worldIdArgument) {
  usage();
  process.exitCode = 1;
} else {
  const unknownFlag = flags.find(flag => flag !== "--dry-run");
  if (unknownFlag) throw new Error(`Unknown option: ${unknownFlag}`);

  const inputPath = resolve(inputArgument);
  const outputRoot = resolve(outputArgument);
  const dryRun = flags.includes("--dry-run");
  const snapshot = JSON.parse(await readFile(inputPath, "utf8"));
  const plan = buildArchiveExportPlan(snapshot, { worldId: worldIdArgument });

  const resolveInsideOutput = path => {
    const target = resolve(outputRoot, path);
    const pathFromRoot = relative(outputRoot, target);
    if (!pathFromRoot || pathFromRoot.startsWith("..") || isAbsolute(pathFromRoot)) {
      throw new Error(`Export path escapes or replaces the output root: ${path}`);
    }
    return target;
  };

  for (const file of plan.files) resolveInsideOutput(file.path);

  const counts = plan.files.reduce((result, file) => {
    const group = file.entityKey?.split(":").at(-2) ?? "manifest";
    result[group] = (result[group] ?? 0) + 1;
    return result;
  }, {});

  if (dryRun) {
    console.log(JSON.stringify({ inputPath, outputRoot, worldId: worldIdArgument, counts }, null, 2));
  } else {
    await mkdir(outputRoot, { recursive: true });
    const existingEntries = await readdir(outputRoot);
    const hasManifest = existingEntries.includes(MANIFEST_PATH);
    if (existingEntries.length && !hasManifest) {
      throw new Error("Output directory is not empty and has no Azgaar Archive manifest");
    }
    if (hasManifest) {
      const previous = JSON.parse(await readFile(resolve(outputRoot, MANIFEST_PATH), "utf8"));
      if (previous.worldId !== worldIdArgument) {
        throw new Error(
          `Output directory belongs to worldId ${JSON.stringify(previous.worldId)}, not ${JSON.stringify(worldIdArgument)}`
        );
      }
    }

    const manifestFile = plan.files.find(file => file.path === MANIFEST_PATH);
    const entityFiles = plan.files.filter(file => file.path !== MANIFEST_PATH);
    for (const file of entityFiles) {
      const target = resolveInsideOutput(file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.content, "utf8");
    }
    if (!manifestFile) throw new Error("Archive export plan did not contain a manifest");
    await writeFile(resolveInsideOutput(manifestFile.path), manifestFile.content, "utf8");
    console.log(`Exported ${entityFiles.length} entity notes to ${outputRoot}`);
  }
}
