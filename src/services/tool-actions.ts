export type ToolActionCategory = "add" | "edit" | "export-sync" | "inspect" | "regenerate";

export type ToolAction = {
  category: ToolActionCategory;
  id: string;
  label: string;
  run: () => void | Promise<void>;
};

const actions = new Map<string, ToolAction>();

const register = (action: ToolAction) => {
  if (actions.has(action.id)) throw new Error(`Tool action is already registered: ${action.id}`);
  actions.set(action.id, action);
};

const list = (category?: ToolActionCategory) =>
  [...actions.values()]
    .filter(action => !category || action.category === category)
    .map(({ run: _run, ...action }) => action);

const run = async (id: string) => {
  const action = actions.get(id);
  if (!action) throw new Error(`Unknown tool action: ${id}`);
  await action.run();
};

register({
  id: "archive-export",
  category: "export-sync",
  label: "Archive Export Profile",
  run: async () => {
    const { ArchiveExportDownload } = await import("@/services/io/archive-export-download");
    ArchiveExportDownload.openConfiguration();
  }
});

register({
  id: "archive-export-diagnostics",
  category: "export-sync",
  label: "Archive Export Diagnostics",
  run: async () => {
    const { ArchiveExportDownload } = await import("@/services/io/archive-export-download");
    ArchiveExportDownload.openDiagnostics();
  }
});

export const ToolActions = { list, register, run };
