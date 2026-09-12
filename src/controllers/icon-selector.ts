// The Icon Selector: pick an emoji or add an external image to use as an icon
import { destroyDialog } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { ICONS, ICONS_PER_ROW } from "@/data/icons-list";
import { ensureEl } from "@/utils";

function open(initial: string, callback: (value: string) => void): void {
  const dialog = renderDialog();
  const table = ensureEl<HTMLTableElement>("iconTable");
  const input = ensureEl<HTMLInputElement>("iconInput");
  input.value = initial;

  if (!table.innerHTML) {
    renderIcons(table);
    for (const url of getUsedImages()) addImage(url, callback);
  }

  input.oninput = () => callback(input.value);

  table.onclick = event => {
    const target = event.target as HTMLElement;
    if (target.tagName !== "TD") return;
    input.value = target.textContent || "";
    callback(input.value);
  };

  table.onmouseover = event => {
    const target = event.target as HTMLElement;
    if (target.tagName === "TD") tip(`Click to select ${target.textContent} icon`);
  };

  const addImageButton = ensureEl("addImage");
  addImageButton.onclick = () => {
    const urlInput = addImageButton.previousElementSibling as HTMLInputElement;
    const url = urlInput.value;
    if (!url) return tip("Enter image URL to add", false, "error", 4000);
    if (!url.match(/^((http|https):\/\/)|data:image\//)) return tip("Enter valid URL", false, "error", 4000);

    addImage(url, callback);
    callback(url);
    urlInput.value = "";
  };

  const fileInput = ensureEl<HTMLInputElement>("iconFileInput");
  ensureEl("importIconFile").onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return tip("Select an image file", false, "error", 4000);
    if (file.size > 1024 * 1024) return tip("Keep embedded icons under 1 MB", false, "error", 5000);

    try {
      const url = await readImageFile(file);
      addImage(url, callback);
      callback(url);
    } catch {
      tip("Could not read the selected image", false, "error", 5000);
    }
  };

  for (const image of Array.from(ensureEl("addedIcons").querySelectorAll<HTMLElement>("div"))) {
    image.onclick = () => image.dataset.icon && callback(image.dataset.icon);
  }

  $(dialog).dialog({
    width: "fit-content",
    title: "Select Icon",
    close: () => destroyDialog("iconSelector"),
    buttons: {
      Apply: function (this: HTMLElement) {
        $(this).dialog("close");
      },
      Close: function (this: HTMLElement) {
        callback(initial);
        $(this).dialog("close");
      }
    }
  });
}

function renderDialog(): HTMLElement {
  destroyDialog("iconSelector");

  const dialog = document.createElement("div");
  dialog.id = "iconSelector";
  dialog.className = "dialog";
  dialog.style.display = "none";
  dialog.innerHTML = /* html */ `<div>
      <b>Unicode emojis</b>
      <div style="font-style: italic">
        <span>Select from the list or paste a Unicode character here: </span>
        <input id="iconInput" style="width: 2.5em" />
        <span>. See <a href="https://emojidb.org" target="_blank">EmojiDB</a> to search for emojis</span>
      </div>
      <table id="iconTable" class="table pointer" style="font-size: 2em; text-align: center; width: 100%"></table>
    </div>
    <div style="margin-top: 0.5em">
      <b>External images</b>
      <div style="font-style: italic">
        <span>Paste link to the image here: </span>
        <input id="imageInput" style="width: 20em" />
        <button id="addImage" type="button">Add</button>
      </div>
      <div style="font-style: italic; margin-top: .35em">
        <button id="importIconFile" type="button">Import local image…</button>
        <input id="iconFileInput" type="file" accept="image/*" hidden />
        <span>Embeds the selected image in this map (maximum 1 MB).</span>
      </div>
      <div id="addedIcons" class="pointer" style="display: flex; flex-wrap: wrap; max-width: 420px"></div>
    </div>`;

  ensureEl("dialogs").appendChild(dialog);
  return dialog;
}

function renderIcons(table: HTMLTableElement): void {
  let row: HTMLTableRowElement | null = null;
  ICONS.forEach((icon, i) => {
    if (i % ICONS_PER_ROW === 0) row = table.insertRow(Math.floor(i / ICONS_PER_ROW));
    row?.insertCell(i % ICONS_PER_ROW).appendChild(document.createTextNode(icon));
  });
}

/** Collect the external images already used as icons on this map */
function getUsedImages(): Set<string> {
  const isExternal = (url: string) => url.startsWith("http") || url.startsWith("data:image");
  const images = new Set<string>();

  for (const unit of options.military) if (isExternal(unit.icon)) images.add(unit.icon);
  for (const state of pack.states ?? []) {
    for (const regiment of state?.military || []) if (isExternal(regiment.icon)) images.add(regiment.icon);
  }
  for (const layer of pack.customLayers ?? []) {
    if (isExternal(layer.icon)) images.add(layer.icon);
    for (const entity of layer.entities) if (entity.icon && isExternal(entity.icon)) images.add(entity.icon);
  }

  return images;
}

function addImage(url: string, callback: (value: string) => void): void {
  const image = document.createElement("div");
  image.dataset.icon = url;
  image.style.cssText =
    "width: 2.2em; height: 2.2em; background-size: contain; background-repeat: no-repeat; background-position: center";
  image.style.backgroundImage = `url("${url}")`;
  image.onclick = () => callback(url);
  ensureEl("addedIcons").appendChild(image);
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export const IconSelector = { open };
