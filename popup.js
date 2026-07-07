// State
let state = {
  profiles: [],
  activeProfileId: "",
  enabled: true,
};

let themeMode = "system"; // "system" | "dark" | "light"

function applyTheme(mode) {
  themeMode = mode;
  const html = document.documentElement;
  if (mode === "system") {
    html.removeAttribute("data-theme");
  } else {
    html.setAttribute("data-theme", mode);
  }
  const label = document.getElementById("theme-toggle-label");
  if (label) {
    label.textContent =
      mode === "dark"
        ? "Theme: Dark"
        : mode === "light"
          ? "Theme: Light"
          : "Theme: System";
  }
}

function cycleTheme() {
  const next = { system: "dark", dark: "light", light: "system" };
  const newMode = next[themeMode] || "dark";
  applyTheme(newMode);
  chrome.storage.local.set({ theme: newMode });
}

function makeSvgIcon(pathD, className) {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  if (className) svg.setAttribute("class", className);
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute("d", pathD);
  svg.appendChild(path);
  return svg;
}

function uid(prefix) {
  return prefix + "_" + Date.now() + "_" + Math.floor(Math.random() * 100000);
}

// ---------- Drag-and-drop row reordering ----------
const DRAG_HANDLE_PATH =
  "M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6C7.9 4 7 4.9 7 6s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z";

function createDragHandle() {
  const handle = document.createElement("div");
  handle.className = "drag-handle";
  handle.title = "Drag to reorder";
  handle.draggable = true;
  handle.appendChild(makeSvgIcon(DRAG_HANDLE_PATH));
  return handle;
}

// Makes `row` reorderable within `container` via `handle`. `onDrop` is
// called once the drag finishes so the caller can persist the new order.
function makeRowDraggable(row, handle, container, rowSelector, onDrop) {
  handle.addEventListener("dragstart", (e) => {
    const rect = row.getBoundingClientRect();
    try {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", row.dataset.id || "");
      e.dataTransfer.setDragImage(
        row,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    } catch (_) {}
    // Deferred so the drag image is captured before we dim the row.
    setTimeout(() => row.classList.add("dragging"), 0);
  });
  handle.addEventListener("dragend", () => {
    row.classList.remove("dragging");
    onDrop();
  });
}

function getDragAfterElement(container, y, rowSelector) {
  const elements = Array.from(
    container.querySelectorAll(`${rowSelector}:not(.dragging)`),
  );
  return elements.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element;
}

// Sets up a single container-level dragover/drop listener that live-moves
// the currently dragging row as the pointer travels over sibling rows.
function setupDragReorder(containerId, rowSelector) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.addEventListener("dragover", (e) => {
    const dragging = container.querySelector(`${rowSelector}.dragging`);
    if (!dragging) return;
    e.preventDefault();
    const afterElement = getDragAfterElement(container, e.clientY, rowSelector);
    if (afterElement == null) {
      container.appendChild(dragging);
    } else {
      container.insertBefore(dragging, afterElement);
    }
  });
  container.addEventListener("drop", (e) => e.preventDefault());
}

// Debounced save for text inputs
let saveTimeout = null;
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveState, 250);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (new URLSearchParams(window.location.search).get("fullscreen") === "1") {
    document.body.classList.add("tabview");
  }
  await loadState();
  setupEventListeners();
  renderAll();
  // Reveal now that sections are in their final state. Transitions are still
  // suppressed (body.preload) so nothing animates into place; re-enable them
  // after the first paint for subsequent user interactions.
  document.querySelector(".content").classList.remove("content-hidden");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.remove("preload"));
  });
});

// ---------- Persistence ----------
function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["profiles", "activeProfileId", "enabled", "theme"],
      (result) => {
        if (result.profiles && result.profiles.length > 0) {
          state.profiles = result.profiles;
          state.activeProfileId =
            result.activeProfileId || result.profiles[0].id;
          state.enabled = result.enabled !== false;
        } else {
          const def = createDefaultProfileObject("Profile 1");
          state.profiles = [def];
          state.activeProfileId = def.id;
          state.enabled = true;
          saveState();
        }
        applyTheme(result.theme || "system");
        resolve();
      },
    );
  });
}

function saveState() {
  chrome.storage.local.set(state);
}

function createDefaultProfileObject(name) {
  return {
    id: uid("profile"),
    name: name || "New Profile",
    requestEnabled: true,
    responseEnabled: true,
    filtersEnabled: true,
    tabFiltersEnabled: true,
    blockUrlsEnabled: true,
    headers: [
      {
        id: uid("h"),
        type: "request",
        action: "set",
        name: "X-Test-Header",
        value: "TestHeader",
        enabled: true,
      },
    ],
    filters: [],
    tabFilters: [],
    blockedUrls: [],
  };
}

function getActiveProfile() {
  return state.profiles.find((p) => p.id === state.activeProfileId);
}

// ---------- Event Listeners ----------
function setupEventListeners() {
  // Pause / play
  document.getElementById("pause-play-btn").addEventListener("click", () => {
    state.enabled = !state.enabled;
    updatePausePlayUI();
    saveState();
  });

  // Profile switcher dropdown
  const switcher = document.getElementById("profile-switcher");
  switcher.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("profiles-dropdown", switcher);
  });

  // Add profile
  document.getElementById("add-profile-btn").addEventListener("click", () => {
    const newProfile = createDefaultProfileObject(
      `Profile ${state.profiles.length + 1}`,
    );
    newProfile.headers = []; // start blank for additional profiles
    state.profiles.push(newProfile);
    state.activeProfileId = newProfile.id;
    closeAllDropdowns();
    saveState();
    renderAll();
  });

  // Main (kebab) menu
  const menuBtn = document.getElementById("menu-btn");
  menuBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDropdown("main-menu", menuBtn);
  });

  document.querySelectorAll("#main-menu .dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      handleMenuAction(item.getAttribute("data-action"));
    });
  });

  // Inline rename input
  const nameInput = document.getElementById("profile-name-input");
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      nameInput.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      finishRename(false);
    }
  });
  nameInput.addEventListener("blur", () => finishRename(true));

  // Section toggles
  document
    .getElementById("request-section-enabled")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (p) {
        p.requestEnabled = e.target.checked;
        toggleCard("request-card", e.target.checked);
        saveState();
      }
    });
  document
    .getElementById("response-section-enabled")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (p) {
        p.responseEnabled = e.target.checked;
        toggleCard("response-card", e.target.checked);
        saveState();
      }
    });
  document
    .getElementById("filters-section-enabled")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (p) {
        p.filtersEnabled = e.target.checked;
        toggleCard("filters-card", e.target.checked);
        saveState();
      }
    });
  document
    .getElementById("tab-filters-section-enabled")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (p) {
        p.tabFiltersEnabled = e.target.checked;
        toggleCard("tab-filters-card", e.target.checked);
        saveState();
      }
    });
  document
    .getElementById("block-urls-section-enabled")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (p) {
        p.blockUrlsEnabled = e.target.checked;
        toggleCard("block-urls-card", e.target.checked);
        saveState();
      }
    });

  // Select-all checkboxes (enable/disable every row in a section at once)
  document
    .getElementById("request-select-all")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (!p) return;
      p.headers
        .filter((h) => h.type === "request")
        .forEach((h) => (h.enabled = e.target.checked));
      saveState();
      renderHeaderRows("request");
    });
  document
    .getElementById("response-select-all")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (!p) return;
      p.headers
        .filter((h) => h.type === "response")
        .forEach((h) => (h.enabled = e.target.checked));
      saveState();
      renderHeaderRows("response");
    });
  document
    .getElementById("filter-select-all")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (!p) return;
      (p.filters || []).forEach((f) => (f.enabled = e.target.checked));
      saveState();
      renderFilterRows();
    });
  document
    .getElementById("tab-filter-select-all")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (!p) return;
      (p.tabFilters || []).forEach((f) => (f.enabled = e.target.checked));
      saveState();
      renderTabFilterRows();
    });
  document
    .getElementById("block-url-select-all")
    .addEventListener("change", (e) => {
      const p = getActiveProfile();
      if (!p) return;
      (p.blockedUrls || []).forEach((b) => (b.enabled = e.target.checked));
      saveState();
      renderBlockedUrlRows();
    });

  // Add row buttons
  document
    .getElementById("add-request-header-btn")
    .addEventListener("click", () => addNewHeader("request"));
  document
    .getElementById("add-response-header-btn")
    .addEventListener("click", () => addNewHeader("response"));
  document
    .getElementById("add-filter-btn")
    .addEventListener("click", addNewFilter);
  document
    .getElementById("add-tab-filter-btn")
    .addEventListener("click", addNewTabFilter);
  document
    .getElementById("add-block-url-btn")
    .addEventListener("click", addNewBlockedUrl);

  // Import file input
  document
    .getElementById("import-file-input")
    .addEventListener("change", handleImportFile);

  // Keep clicks inside a menu from bubbling to the document close handler
  document.querySelectorAll(".dropdown-menu").forEach((menu) => {
    menu.addEventListener("click", (e) => e.stopPropagation());
  });

  // Close dropdowns on outside click / Escape
  document.addEventListener("click", closeAllDropdowns);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllDropdowns();
  });

  // Drag-and-drop row reordering
  setupDragReorder("request-rows", ".header-row");
  setupDragReorder("response-rows", ".header-row");
  setupDragReorder("filter-rows", ".filter-row");
  setupDragReorder("block-url-rows", ".filter-row");
  setupDragReorder("tab-filter-rows", ".tab-filter-row");
}

// ---------- Dropdown helpers ----------
function toggleDropdown(menuId, triggerEl) {
  const menu = document.getElementById(menuId);
  const isOpen = !menu.classList.contains("hidden");
  closeAllDropdowns();
  if (!isOpen) {
    menu.classList.remove("hidden");
    if (triggerEl) triggerEl.classList.add("open");
  }
}

function closeAllDropdowns() {
  document
    .querySelectorAll(".dropdown-menu")
    .forEach((m) => m.classList.add("hidden"));
  document.getElementById("profile-switcher").classList.remove("open");
}

// ---------- Menu actions ----------
function handleMenuAction(action) {
  if (action !== "toggle-theme") closeAllDropdowns();
  const p = getActiveProfile();
  if (!p) return;

  switch (action) {
    case "rename":
      startRename();
      break;
    case "duplicate":
      duplicateProfile();
      break;
    case "delete":
      deleteProfile();
      break;
    case "export":
      exportProfile();
      break;
    case "import":
      document.getElementById("import-file-input").click();
      break;
    case "fullscreen":
      chrome.tabs.create({
        url: chrome.runtime.getURL("popup.html?fullscreen=1"),
      });
      break;
    case "help":
      showHelp();
      break;
    case "toggle-theme":
      cycleTheme();
      break;
  }
}

function startRename() {
  const p = getActiveProfile();
  if (!p) return;
  const switcher = document.getElementById("profile-switcher");
  const input = document.getElementById("profile-name-input");
  switcher.classList.add("hidden");
  input.classList.remove("hidden");
  input.value = p.name;
  input.focus();
  input.select();
}

let renaming = false;
function finishRename(commit) {
  const input = document.getElementById("profile-name-input");
  if (input.classList.contains("hidden")) return;
  if (renaming) return;
  renaming = true;

  const p = getActiveProfile();
  if (p && commit) {
    p.name = input.value.trim() || "Unnamed Profile";
    saveState();
  }
  input.classList.add("hidden");
  document.getElementById("profile-switcher").classList.remove("hidden");
  renderProfileHeader();
  renderProfilesDropdown();
  renaming = false;
}

function duplicateProfile() {
  const p = getActiveProfile();
  if (!p) return;
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = uid("profile");
  copy.name = p.name + " copy";
  copy.headers = (copy.headers || []).map((h) => ({ ...h, id: uid("h") }));
  copy.filters = (copy.filters || []).map((f) => ({ ...f, id: uid("f") }));
  copy.tabFilters = (copy.tabFilters || []).map((t) => ({
    ...t,
    id: uid("t"),
  }));
  copy.blockedUrls = (copy.blockedUrls || []).map((b) => ({
    ...b,
    id: uid("b"),
  }));
  const idx = state.profiles.findIndex((x) => x.id === p.id);
  state.profiles.splice(idx + 1, 0, copy);
  state.activeProfileId = copy.id;
  saveState();
  renderAll();
}

function deleteProfile() {
  const p = getActiveProfile();
  if (!p) return;
  if (!confirm(`Delete profile "${p.name}"?`)) return;
  state.profiles = state.profiles.filter((x) => x.id !== p.id);
  if (state.profiles.length === 0) {
    state.profiles = [createDefaultProfileObject("Profile 1")];
  }
  state.activeProfileId = state.profiles[0].id;
  saveState();
  renderAll();
}

function exportProfile() {
  const p = getActiveProfile();
  if (!p) return;
  const dataStr =
    "data:text/json;charset=utf-8," +
    encodeURIComponent(JSON.stringify(p, null, 2));
  const a = document.createElement("a");
  a.setAttribute("href", dataStr);
  a.setAttribute(
    "download",
    `profile_${p.name.toLowerCase().replace(/\s+/g, "_")}.json`,
  );
  a.click();
}

// ---------- Import helpers ----------
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

function isModHeaderHeader(header) {
  return header && header.appendMode !== undefined && !header.type;
}

function normalizeImportedHeader(header, defaultType) {
  const type = header.type || defaultType || "request";
  let action = header.action;
  if (!action) {
    action = header.appendMode ? "set" : "set";
  }
  return {
    id: uid("h"),
    type,
    action,
    name: header.name || "",
    value: header.value || "",
    enabled: header.enabled !== false,
  };
}

function normalizeImportedFilter(filter) {
  return {
    id: uid("f"),
    type: filter.type || "url_regex",
    value: filter.value || filter.urlRegex || "",
    enabled: filter.enabled !== false,
  };
}

function normalizeImportedBlockedUrl(blockedUrl) {
  return {
    id: uid("b"),
    value: blockedUrl.value || blockedUrl.urlRegex || "",
    enabled: blockedUrl.enabled !== false,
  };
}

function normalizeImportedTabFilter(tabFilter) {
  return {
    id: uid("t"),
    tabId: tabFilter.tabId,
    label: tabFilter.label || `Tab ${tabFilter.tabId}`,
    favicon: tabFilter.favicon || "",
    enabled: tabFilter.enabled !== false,
  };
}

function normalizeImportedProfile(raw) {
  const profile = {
    id: uid("profile"),
    name: raw.name || raw.title || "Imported Profile",
    requestEnabled: raw.requestEnabled !== false,
    responseEnabled: raw.responseEnabled !== false,
    filtersEnabled: raw.filtersEnabled !== false,
    tabFiltersEnabled: raw.tabFiltersEnabled !== false,
    blockUrlsEnabled: raw.blockUrlsEnabled !== false,
    headers: [],
    filters: [],
    tabFilters: [],
    blockedUrls: [],
  };

  const requestHeaders = raw.headers || raw.requestHeaders || [];
  const responseHeaders = raw.responseHeaders || raw.respHeaders || [];
  const modHeaderFormat = Array.isArray(requestHeaders) && requestHeaders.some(isModHeaderHeader);

  if (Array.isArray(requestHeaders)) {
    requestHeaders.forEach((header) => {
      profile.headers.push(normalizeImportedHeader(header, modHeaderFormat ? "request" : undefined));
    });
  }
  if (Array.isArray(responseHeaders)) {
    responseHeaders.forEach((header) => {
      profile.headers.push(normalizeImportedHeader(header, "response"));
    });
  }

  const filters = raw.filters || raw.urlFilters || [];
  if (Array.isArray(filters)) {
    profile.filters = filters.map(normalizeImportedFilter);
  }

  if (Array.isArray(raw.tabFilters)) {
    profile.tabFilters = raw.tabFilters
      .filter((tabFilter) => tabFilter && tabFilter.tabId !== undefined)
      .map(normalizeImportedTabFilter);
  }

  const blockedUrls = raw.blockedUrls || [];
  if (Array.isArray(blockedUrls)) {
    profile.blockedUrls = blockedUrls.map(normalizeImportedBlockedUrl);
  }

  return profile;
}

function extractProfilesFromImport(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.filter((item) => item && typeof item === "object");
  }
  if (parsed && Array.isArray(parsed.profiles)) {
    return parsed.profiles;
  }
  if (parsed && typeof parsed === "object" && (parsed.headers || parsed.title || parsed.name || parsed.id)) {
    return [parsed];
  }
  return null;
}

async function handleImportFile(e) {
  const files = Array.from(e.target.files || []);
  if (files.length === 0) return;

  let importedCount = 0;
  let lastImportedId = null;
  const errors = [];

  for (const file of files) {
    try {
      const text = await readFileAsText(file);
      const parsed = JSON.parse(text);
      const rawProfiles = extractProfilesFromImport(parsed);
      if (!rawProfiles || rawProfiles.length === 0) {
        errors.push(`${file.name}: invalid profile file format`);
        continue;
      }

      const normalizedProfiles = rawProfiles.map(normalizeImportedProfile);
      normalizedProfiles.forEach((profile) => state.profiles.push(profile));
      importedCount += normalizedProfiles.length;
      lastImportedId = normalizedProfiles[normalizedProfiles.length - 1].id;
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  e.target.value = "";

  if (importedCount > 0) {
    state.activeProfileId = lastImportedId;
    saveState();
    renderAll();
  }

  if (errors.length > 0 && importedCount > 0) {
    alert(`Imported ${importedCount} profile(s).\n\nSome files failed:\n${errors.join("\n")}`);
  } else if (errors.length > 0) {
    alert(`Import failed:\n${errors.join("\n")}`);
  } else if (importedCount > 0) {
    alert(`Imported ${importedCount} profile(s)!`);
  }
}

function showHelp() {
  alert(
    "OpenHeader — Help\n\n" +
      "• Request headers: add/remove headers sent with your requests.\n" +
      "• Response headers: add/remove headers on responses.\n" +
      "• Set vs Remove: 'Set' overrides a header value; 'Remove' strips it.\n" +
      "• URL filters: optional regexes (e.g. .*://example.com/.*) to limit where changes apply. With no filters, changes apply everywhere.\n" +
      "• Block URLs: optional regexes for requests that should be left alone. Matching requests still go through normally — they just never get their headers modified.\n" +
      "• Profiles: switch from the badge in the top-left; manage them from the ⋮ menu.\n" +
      "• Pause: the ⏸ button temporarily disables all modifications.",
  );
}

// ---------- Header / filter operations ----------
function addNewHeader(type) {
  const p = getActiveProfile();
  if (!p) return;
  p.headers.push({
    id: uid("h"),
    type,
    action: "set",
    name: "",
    value: "",
    enabled: true,
  });
  saveState();
  renderHeaderRows(type);
}

async function addNewFilter() {
  const p = getActiveProfile();
  if (!p) return;
  if (!p.filters) p.filters = [];

  let defaultValue = "";
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      const { hostname } = new URL(tab.url);
      if (hostname) {
        defaultValue = `.*://${hostname}/.*`;
      }
    }
  } catch (_) {}

  p.filters.push({
    id: uid("f"),
    type: "url_regex",
    value: defaultValue,
    enabled: true,
  });
  saveState();
  renderFilterRows();
}

async function addNewBlockedUrl() {
  const p = getActiveProfile();
  if (!p) return;
  if (!p.blockedUrls) p.blockedUrls = [];

  let defaultValue = "";
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab && tab.url) {
      const { hostname } = new URL(tab.url);
      if (hostname) {
        defaultValue = `.*://${hostname}/.*`;
      }
    }
  } catch (_) {}

  p.blockedUrls.push({
    id: uid("b"),
    value: defaultValue,
    enabled: true,
  });
  saveState();
  renderBlockedUrlRows();
}

// Build a short, readable label (hostname + path) from a tab URL.
function tabLabel(url, fallback) {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return u.hostname + path;
  } catch (_) {
    return fallback || url || "Tab";
  }
}

async function addNewTabFilter() {
  const p = getActiveProfile();
  if (!p) return;
  if (!p.tabFilters) p.tabFilters = [];

  let tab;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}

  if (!tab || typeof tab.id !== "number" || tab.id < 0) {
    alert("Couldn't read the current tab.");
    return;
  }

  // Avoid adding the same tab twice.
  if (p.tabFilters.some((t) => t.tabId === tab.id)) {
    alert("This tab is already in the list.");
    return;
  }

  p.tabFilters.push({
    id: uid("t"),
    tabId: tab.id,
    label: tabLabel(tab.url, tab.title),
    favicon: tab.favIconUrl || "",
    enabled: true,
  });
  saveState();
  renderTabFilterRows();
}

// ---------- Rendering ----------
function updatePausePlayUI() {
  const btn = document.getElementById("pause-play-btn");
  const pauseIcon = document.getElementById("pause-icon");
  const playIcon = document.getElementById("play-icon");
  if (state.enabled) {
    document.body.classList.remove("extension-disabled");
    btn.className = "header-action-btn pause";
    btn.title = "Pause modifying headers";
    pauseIcon.classList.remove("hidden");
    playIcon.classList.add("hidden");
  } else {
    document.body.classList.add("extension-disabled");
    closeAllDropdowns();
    btn.className = "header-action-btn play";
    btn.title = "Resume modifying headers";
    pauseIcon.classList.add("hidden");
    playIcon.classList.remove("hidden");
  }
}

function toggleCard(cardId, enabled) {
  const card = document.getElementById(cardId);
  card.classList.toggle("disabled", !enabled);
  const selectAllCheck = card.querySelector(".select-all-check");
  if (selectAllCheck) selectAllCheck.disabled = !enabled;
}

// Keeps a section's "select all" checkbox in sync with its rows: checked when
// every row is enabled, unchecked when none are, indeterminate otherwise.
function updateSelectAllCheckbox(id, items) {
  const cb = document.getElementById(id);
  if (!cb) return;
  if (!items || items.length === 0) {
    cb.checked = false;
    cb.indeterminate = false;
    return;
  }
  const enabledCount = items.filter((item) => item.enabled).length;
  cb.checked = enabledCount === items.length;
  cb.indeterminate = enabledCount > 0 && enabledCount < items.length;
}

function renderProfileHeader() {
  const p = getActiveProfile();
  if (!p) return;
  const idx = state.profiles.findIndex((x) => x.id === p.id);
  document.getElementById("active-profile-badge").textContent = (
    idx + 1
  ).toString();
  document.getElementById("active-profile-name").textContent = p.name;
}

function renderProfilesDropdown() {
  const list = document.getElementById("profiles-dropdown-list");
  list.replaceChildren();
  state.profiles.forEach((profile, index) => {
    const isActive = profile.id === state.activeProfileId;
    const btn = document.createElement("button");
    btn.className = `profile-entry ${isActive ? "active" : ""}`;
    const initial = profile.name
      ? profile.name.charAt(0).toUpperCase()
      : (index + 1).toString();

    const badge = document.createElement("span");
    badge.className = "entry-badge";
    badge.textContent = initial;

    const nameSpan = document.createElement("span");
    nameSpan.className = "entry-name";
    nameSpan.textContent = profile.name;

    btn.append(badge, nameSpan, makeSvgIcon("M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z", "entry-check"));
    btn.addEventListener("click", () => {
      state.activeProfileId = profile.id;
      closeAllDropdowns();
      saveState();
      renderAll();
    });
    list.appendChild(btn);
  });
}

function renderHeaderRows(type) {
  const container = document.getElementById(`${type}-rows`);
  container.replaceChildren();
  const p = getActiveProfile();
  if (!p) return;

  const headers = p.headers.filter((h) => h.type === type);
  updateSelectAllCheckbox(`${type}-select-all`, headers);
  if (headers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = `No ${type} headers yet.`;
    container.appendChild(empty);
    return;
  }

  headers.forEach((header) => {
    const row = document.createElement("div");
    row.className = "header-row";
    row.dataset.id = header.id;

    const handle = createDragHandle();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-check";
    checkbox.checked = header.enabled;
    checkbox.title = "Enable this header";

    const select = document.createElement("select");
    select.className = "row-select";
    const optSet = document.createElement("option");
    optSet.value = "set";
    optSet.textContent = "Set";
    optSet.selected = header.action === "set";
    const optRemove = document.createElement("option");
    optRemove.value = "remove";
    optRemove.textContent = "Remove";
    optRemove.selected = header.action === "remove";
    select.append(optSet, optRemove);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "row-input row-name";
    nameInput.value = header.name;
    nameInput.placeholder = "Header name";

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "row-input row-value";
    valueInput.value = header.value;
    valueInput.placeholder = "Value";
    if (header.action === "remove") valueInput.disabled = true;

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete";
    deleteBtn.appendChild(makeSvgIcon("M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"));

    row.append(handle, checkbox, select, nameInput, valueInput, deleteBtn);

    makeRowDraggable(row, handle, container, ".header-row", () =>
      commitHeaderOrder(type),
    );

    checkbox.addEventListener("change", (e) => {
      header.enabled = e.target.checked;
      updateSelectAllCheckbox(`${type}-select-all`, headers);
      saveState();
    });

    select.addEventListener("change", (e) => {
      header.action = e.target.value;
      if (header.action === "remove") {
        valueInput.disabled = true;
        valueInput.value = "";
        header.value = "";
      } else {
        valueInput.disabled = false;
      }
      saveState();
    });

    nameInput.addEventListener("input", (e) => {
      header.name = e.target.value.trim();
      debouncedSave();
    });
    valueInput.addEventListener("input", (e) => {
      header.value = e.target.value;
      debouncedSave();
    });

    deleteBtn.addEventListener("click", () => {
      p.headers = p.headers.filter((h) => h.id !== header.id);
      saveState();
      renderHeaderRows(type);
    });

    container.appendChild(row);
  });
}

function commitHeaderOrder(type) {
  const p = getActiveProfile();
  if (!p) return;
  const container = document.getElementById(`${type}-rows`);
  const orderedIds = Array.from(container.querySelectorAll(".header-row")).map(
    (r) => r.dataset.id,
  );
  const positions = [];
  p.headers.forEach((h, idx) => {
    if (h.type === type) positions.push(idx);
  });
  const byId = new Map(p.headers.map((h) => [h.id, h]));
  const reordered = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  positions.forEach((pos, i) => {
    if (reordered[i]) p.headers[pos] = reordered[i];
  });
  saveState();
}

function renderFilterRows() {
  const container = document.getElementById("filter-rows");
  container.replaceChildren();
  const p = getActiveProfile();
  if (!p) return;
  const filters = p.filters || [];
  updateSelectAllCheckbox("filter-select-all", filters);

  if (filters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = "No filters — modifications apply to all URLs.";
    container.appendChild(empty);
    return;
  }

  filters.forEach((filter) => {
    const row = document.createElement("div");
    row.className = "filter-row";
    row.dataset.id = filter.id;

    const handle = createDragHandle();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-check";
    checkbox.checked = filter.enabled;
    checkbox.title = "Enable this filter";

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "row-input row-value";
    valueInput.value = filter.value;
    valueInput.placeholder = "URL regex (e.g. .*://example.com/.*)";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete";
    deleteBtn.appendChild(makeSvgIcon("M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"));

    row.append(handle, checkbox, valueInput, deleteBtn);

    makeRowDraggable(row, handle, container, ".filter-row", commitFilterOrder);

    checkbox.addEventListener("change", (e) => {
      filter.enabled = e.target.checked;
      updateSelectAllCheckbox("filter-select-all", filters);
      saveState();
    });
    valueInput.addEventListener("input", (e) => {
      filter.value = e.target.value.trim();
      debouncedSave();
    });
    deleteBtn.addEventListener("click", () => {
      p.filters = p.filters.filter((f) => f.id !== filter.id);
      saveState();
      renderFilterRows();
    });

    container.appendChild(row);
  });
}

function commitFilterOrder() {
  const p = getActiveProfile();
  if (!p) return;
  const container = document.getElementById("filter-rows");
  const orderedIds = Array.from(container.querySelectorAll(".filter-row")).map(
    (r) => r.dataset.id,
  );
  const byId = new Map((p.filters || []).map((f) => [f.id, f]));
  p.filters = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  saveState();
}

function renderBlockedUrlRows() {
  const container = document.getElementById("block-url-rows");
  container.replaceChildren();
  const p = getActiveProfile();
  if (!p) return;
  const blockedUrls = p.blockedUrls || [];
  updateSelectAllCheckbox("block-url-select-all", blockedUrls);

  if (blockedUrls.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-row";
    empty.textContent = "No blocked URLs — headers apply everywhere.";
    container.appendChild(empty);
    return;
  }

  blockedUrls.forEach((blockedUrl) => {
    const row = document.createElement("div");
    row.className = "filter-row";
    row.dataset.id = blockedUrl.id;

    const handle = createDragHandle();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-check";
    checkbox.checked = blockedUrl.enabled;
    checkbox.title = "Enable this block rule";

    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "row-input row-value";
    valueInput.value = blockedUrl.value;
    valueInput.placeholder = "URL regex to block (e.g. .*://ads.example.com/.*)";

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete";
    deleteBtn.appendChild(makeSvgIcon("M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"));

    row.append(handle, checkbox, valueInput, deleteBtn);

    makeRowDraggable(row, handle, container, ".filter-row", commitBlockedUrlOrder);

    checkbox.addEventListener("change", (e) => {
      blockedUrl.enabled = e.target.checked;
      updateSelectAllCheckbox("block-url-select-all", blockedUrls);
      saveState();
    });
    valueInput.addEventListener("input", (e) => {
      blockedUrl.value = e.target.value.trim();
      debouncedSave();
    });
    deleteBtn.addEventListener("click", () => {
      p.blockedUrls = p.blockedUrls.filter((b) => b.id !== blockedUrl.id);
      saveState();
      renderBlockedUrlRows();
    });

    container.appendChild(row);
  });
}

function commitBlockedUrlOrder() {
  const p = getActiveProfile();
  if (!p) return;
  const container = document.getElementById("block-url-rows");
  const orderedIds = Array.from(container.querySelectorAll(".filter-row")).map(
    (r) => r.dataset.id,
  );
  const byId = new Map((p.blockedUrls || []).map((b) => [b.id, b]));
  p.blockedUrls = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  saveState();
}

function renderTabFilterRows() {
  const container = document.getElementById("tab-filter-rows");
  container.replaceChildren();
  const p = getActiveProfile();
  if (!p) return;
  const tabFilters = p.tabFilters || [];
  updateSelectAllCheckbox("tab-filter-select-all", tabFilters);

  tabFilters.forEach((filter) => {
    const row = document.createElement("div");
    row.className = "tab-filter-row";
    row.dataset.id = filter.id;

    const handle = createDragHandle();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "row-check";
    checkbox.checked = filter.enabled;
    checkbox.title = "Enable this tab filter";

    const label = document.createElement("span");
    label.className = "tab-filter-label";
    label.title = `${filter.label} (tab ${filter.tabId})`;

    if (filter.favicon) {
      const img = document.createElement("img");
      img.className = "tab-filter-favicon";
      img.src = filter.favicon;
      img.alt = "";
      // A broken favicon (e.g. tab closed) just hides the image.
      img.addEventListener("error", () => img.remove());
      label.appendChild(img);
    }

    const textSpan = document.createElement("span");
    textSpan.className = "tab-filter-text";
    textSpan.textContent = filter.label;
    label.appendChild(textSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "delete-btn";
    deleteBtn.title = "Delete";
    deleteBtn.appendChild(makeSvgIcon("M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"));

    row.append(handle, checkbox, label, deleteBtn);

    makeRowDraggable(row, handle, container, ".tab-filter-row", commitTabFilterOrder);

    checkbox.addEventListener("change", (e) => {
      filter.enabled = e.target.checked;
      updateSelectAllCheckbox("tab-filter-select-all", tabFilters);
      saveState();
    });
    deleteBtn.addEventListener("click", () => {
      p.tabFilters = p.tabFilters.filter((f) => f.id !== filter.id);
      saveState();
      renderTabFilterRows();
    });

    container.appendChild(row);
  });
}

function commitTabFilterOrder() {
  const p = getActiveProfile();
  if (!p) return;
  const container = document.getElementById("tab-filter-rows");
  const orderedIds = Array.from(
    container.querySelectorAll(".tab-filter-row"),
  ).map((r) => r.dataset.id);
  const byId = new Map((p.tabFilters || []).map((t) => [t.id, t]));
  p.tabFilters = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  saveState();
}

function renderAll() {
  const p = getActiveProfile();
  if (!p) return;

  renderProfileHeader();
  renderProfilesDropdown();
  updatePausePlayUI();

  const reqOn = p.requestEnabled !== false;
  document.getElementById("request-section-enabled").checked = reqOn;
  toggleCard("request-card", reqOn);

  const resOn = p.responseEnabled !== false;
  document.getElementById("response-section-enabled").checked = resOn;
  toggleCard("response-card", resOn);

  const filtOn = p.filtersEnabled !== false;
  document.getElementById("filters-section-enabled").checked = filtOn;
  toggleCard("filters-card", filtOn);

  const tabFiltOn = p.tabFiltersEnabled !== false;
  document.getElementById("tab-filters-section-enabled").checked = tabFiltOn;
  toggleCard("tab-filters-card", tabFiltOn);

  const blockUrlsOn = p.blockUrlsEnabled !== false;
  document.getElementById("block-urls-section-enabled").checked = blockUrlsOn;
  toggleCard("block-urls-card", blockUrlsOn);

  renderHeaderRows("request");
  renderHeaderRows("response");
  renderFilterRows();
  renderTabFilterRows();
  renderBlockedUrlRows();
}
