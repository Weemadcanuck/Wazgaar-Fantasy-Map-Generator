// Tools tab: buttons dispatch the same commands as global search.
import { MAP_COMMANDS } from "@/components/map-commands";
import { tip } from "@/components/tooltips";
import { capturePerformance } from "@/controllers/performance-diagnostics";
import { downloadFile, ensureEl } from "@/utils";

const TEMPLATE = /* html */ `
  <div class="tools-groups">
    <button type="button" id="toolsExpandAll">Expand all</button>
    <button type="button" id="toolsCollapseAll">Collapse all</button>
  </div>
  <details open><summary>Edit</summary>
  <div class="grid">
    <button id="forkCustomLayers">Custom layers</button>
    <button id="editBiomesButton" data-tip="Click to open Biomes Editor" data-shortcut="Shift + B">
      Biomes
    </button>
    <button id="overviewBurgsButton" data-tip="Click to open Burgs Overview" data-shortcut="Shift + T">
      Burgs
    </button>
    <button
      id="editCoastlineSettings"
      data-tip="Click to open Coastline Editor"
    >
      Coastlines
    </button>
    <button id="editCulturesButton" data-tip="Click to open Cultures Editor" data-shortcut="Shift + C">
      Cultures
    </button>
    <button
      id="editDiplomacyButton"
      data-tip="Click to open Diplomatical relationships Editor"
      data-shortcut="Shift + D"
    >
      Diplomacy
    </button>
    <button id="editEmblemButton" data-tip="Click to open Emblem Editor" data-shortcut="Shift + Y">
      Emblems
    </button>
    <button id="overviewFeaturesButton" data-tip="Click to open Geographical Features Overview" data-shortcut="Shift + F">
      Features
    </button>
    <button id="editGoods" data-tip="Click to open Goods Editor" data-shortcut="Shift + G">Goods</button>
    <button
      id="editHeightmapButton"
      data-tip="Click to open Heightmap customization menu"
      data-shortcut="Shift + H"
    >
      Heightmap
    </button>
    <button id="overviewMarkersButton" data-tip="Click to open Markers Overview" data-shortcut="Shift + K">
      Markers
    </button>
    <button id="overviewMarketsButton" data-tip="Click to open Markets Overview">
      Markets
    </button>
    <button id="editMeasurersButton" data-tip="Click to open Measurers Editor" data-shortcut="Shift + =">
      Measurers
    </button>
    <button id="overviewLabelsButton" data-tip="Click to open Labels Overview" data-shortcut="Shift + L">
      Labels
    </button>
    <button
      id="overviewMilitaryButton"
      data-tip="Click to open Military Forces Overview"
      data-shortcut="Shift + M"
    >
      Military
    </button>
    <button id="editNamesBaseButton" data-tip="Click to open Namesbase Editor" data-shortcut="Shift + N">
      Namesbase
    </button>
    <button id="editNotesButton" data-tip="Click to open Notes Editor" data-shortcut="Shift + O">Notes</button>
    <button id="editProvincesButton" data-tip="Click to open Provinces Editor" data-shortcut="Shift + P">
      Provinces
    </button>
    <button id="editReligions" data-tip="Click to open Religions Editor" data-shortcut="Shift + R">
      Religions
    </button>
    <button id="overviewRiversButton" data-tip="Click to open Rivers Overview" data-shortcut="Shift + V">
      Rivers
    </button>
    <button id="overviewRoutesButton" data-tip="Click to open Routes Overview" data-shortcut="Shift + U">
      Routes
    </button>
    <button id="overviewJourneysButton" data-tip="Click to open Journeys Overview" data-shortcut="Shift + J">
      Journeys
    </button>
    <button id="editStatesButton" data-tip="Click to open States Editor" data-shortcut="Shift + S">
      States
    </button>
    <button id="editTradeAnimationButton" data-tip="Click to open Trade Animation Editor">
      Trade
    </button>
    <button id="editUnitsButton" data-tip="Click to open Units Editor" data-shortcut="Shift + Q">Units</button>
    <button id="editZonesButton" data-tip="Click to open Zones Editor" data-shortcut="Shift + Z">Zones</button>
  </div>
  </details>
  <details><summary>Regenerate</summary>
  <div id="regenerateFeature" class="grid">
    <button
      id="regenerateBurgs"
      data-tip="Click to regenerate all unlocked burgs and routes. States will remain as they are. Note: burgs are only generated in populated areas with culture assigned"
    >
      Burgs
    </button>
    <button id="regenerateCultures" data-tip="Click to regenerate non-locked cultures">Cultures</button>
    <button
      id="regenerateEconomy"
      data-tip="Rebuild market territories, production, trade deals, and taxes from the current goods and markets"
    >
      Economy
    </button>
    <button id="regenerateEmblems" data-tip="Click to regenerate all emblems">Emblems</button>
    <button id="regenerateGoods" data-tip="Click to regenerate bonus goods placement">Goods</button>
    <button id="regenerateIce" data-tip="Click to regenerate icebergs and glaciers">Ice</button>
    <button
      id="regenerateStateLabels"
      data-tip="Click to update state labels placement based on current borders"
    >
      State Labels
    </button>
    <button id="regenerateMarkers" data-tip="Click to regenerate unlocked markers">
      Markers <i id="configRegenerateMarkers" class="icon-cog" data-tip="Click to set number multiplier"></i>
    </button>
    <button id="regenerateMarkets" data-tip="Click to regenerate markets and their territories">
      Markets
    </button>
    <button
      id="regenerateMilitary"
      data-tip="Click to recalculate military forces based on current military options"
    >
      Military
    </button>
    <button id="regeneratePopulation" data-tip="Click to recalculate rural and urban population">
      Population
    </button>
    <button
      id="regenerateProduction"
      data-tip="Click to regenerate production and trade deals"
    >
      Production
    </button>
    <button
      id="regenerateProvinces"
      data-tip="Click to regenerate non-locked provinces. States will remain as they are"
    >
      Provinces
    </button>
    <button
      id="regenerateReliefIcons"
      data-tip="Click to regenerate all relief icons based on current cell biome and elevation"
    >
      Relief
    </button>
    <button id="regenerateReligions" data-tip="Click to regenerate non-locked religions">Religions</button>
    <button id="regenerateRivers" data-tip="Click to regenerate all rivers (restore default state)">
      Rivers
    </button>
    <button id="regenerateRoutes" data-tip="Click to regenerate all unlocked routes">Routes</button>
    <button
      id="regenerateStates"
      data-tip="Click to regenerate non-locked states. Emblems and military forces will be regenerated as well, burgs will remain as they are, but capitals will be different"
    >
      States
    </button>
    <button
      id="regenerateZones"
      data-tip="Click to regenerate zones. Hold Ctrl and click to set zones number multiplier"
    >
      Zones
    </button>
  </div>
  </details>
  <details open><summary>Add</summary>
  <div id="addFeature" class="grid">
    <button
      id="addBurgTool"
      data-tip="Click on map to place a burg. Hold Shift to add multiple"
      data-shortcut="Shift + 1"
    >
      Burg
    </button>
    <button
      id="addLabel"
      data-tip="Click on map to place label. Hold Shift to add multiple"
      data-shortcut="Shift + 2"
    >
      Label
    </button>
    <button
      id="addMarker"
      data-tip="Click on map to place a marker. Hold Shift to add multiple"
      data-shortcut="Shift + 3"
    >
      Marker
    </button>
    <input type="hidden" id="addedMarkerType" name="addedMarkerType" value="" />
    <button
      id="addRiver"
      data-tip="Click on map to place a river. Hold Shift to add multiple"
      data-shortcut="Shift + 4"
    >
      River
    </button>
    <button id="addRoute" data-tip="Open route creation dialog" data-shortcut="Shift + 5">Route</button>
  </div>
  </details>
  <details><summary>Inspect</summary>
  <div class="grid">
    <button id="forkPerformance">Record performance</button>
    <button id="overviewCellsButton" data-tip="Click to open Cell details view" data-shortcut="Shift + E">
      Cells
    </button>
    <button
      id="overviewChartsButton"
      data-tip="Click to open Charts to overview cells data"
      data-shortcut="Shift + A"
    >
      Charts
    </button>
    <button id="openMinimapButton" data-tip="Click to open minimap overview. Click minimap to center view">
      Minimap
    </button>
  </div>
  </details>
  <details><summary>Create</summary>
  <div class="grid">
    <button id="openSubmapTool" data-tip="Click to generate a submap from the current viewport">Submap</button>
    <button id="openTransformTool" data-tip="Click to transform the map">Transform</button>
    <button id="openWrapTool" data-tip="Adjust cell shapes with a brush">Wrap</button>
  </div>
  </details>
  <details><summary>Export</summary>
    <div class="grid">
      <button id="forkArchiveExport">Obsidian export</button>
      <button id="forkLegacyNotes" data-tip="Download the original notes retained during migration">Original notes backup</button>
    </div>
  </details>
`;

ensureEl("toolsContent").innerHTML = TEMPLATE;

ensureEl("toolsContent").addEventListener("click", event => {
  if (!(event instanceof MouseEvent) || !(event.target instanceof HTMLElement)) return;
  if (!["BUTTON", "I"].includes(event.target.tagName)) return;
  if (event.target.id === "toolsExpandAll" || event.target.id === "toolsCollapseAll") {
    const open = event.target.id === "toolsExpandAll";
    for (const group of ensureEl("toolsContent").querySelectorAll("details")) group.open = open;
    return;
  }
  if (customization) return tip("Please exit the customization mode first", false, "error");
  const command = MAP_COMMANDS.find(command => command.id === (event.target as HTMLElement).id);
  if (command) void command.run(event);
});

ensureEl("forkCustomLayers").addEventListener("click", () => void Controllers.CustomLayersEditor.open());
ensureEl("forkArchiveExport").addEventListener("click", () => void Services.ArchiveExport.openConfiguration());
ensureEl("forkPerformance").addEventListener("click", capturePerformance);

ensureEl("forkLegacyNotes").addEventListener("click", () => {
  if (!pack.archiveLegacyNotes?.length) return tip("This map has no legacy notes backup", false, "warn");
  downloadFile(JSON.stringify(pack.archiveLegacyNotes, null, 2), "original-map-notes.json");
});
