const ALL_RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "webbundle",
  "other",
];

// Serialize rebuildRules calls so concurrent storage-change events never interleave.
let _rebuildQueue = Promise.resolve();
function rebuildRules() {
  _rebuildQueue = _rebuildQueue.then(_rebuildRules);
  return _rebuildQueue;
}

// Rebuild declarativeNetRequest dynamic rules based on current storage state
async function _rebuildRules() {
  try {
    const data = await chrome.storage.local.get([
      "profiles",
      "activeProfileId",
      "enabled",
    ]);

    // Default values
    const enabled = data.enabled !== false; // defaults to true
    const profiles = data.profiles || [];
    const activeProfileId = data.activeProfileId;

    const activeProfile = profiles.find((p) => p.id === activeProfileId);

    // Rules without a tab condition can live in dynamic rules; rules that filter
    // by tab MUST be session-scoped, since DNR only supports condition.tabIds
    // on session rules.
    const dynamicAdd = [];
    const sessionAdd = [];

    // Shared rule id counter — block and header-modification rules live in the
    // same dynamic/session rulesets, so ids must be unique across both.
    let ruleId = 1;

    if (enabled && activeProfile) {
      const requestEnabled = activeProfile.requestEnabled !== false;
      const responseEnabled = activeProfile.responseEnabled !== false;
      const filtersEnabled = activeProfile.filtersEnabled !== false;
      const tabFiltersEnabled = activeProfile.tabFiltersEnabled !== false;
      const blockUrlsEnabled = activeProfile.blockUrlsEnabled !== false;

      // Tab IDs restrict where rules apply. With no tab filters, rules apply
      // to all tabs (no tabIds condition).
      const activeTabIds = tabFiltersEnabled
        ? [
            ...new Set(
              (activeProfile.tabFilters || [])
                .filter(
                  (t) =>
                    t.enabled && Number.isInteger(t.tabId) && t.tabId >= 0,
                )
                .map((t) => t.tabId),
            ),
          ]
        : [];

      // Blocked URLs don't block the request itself — they just opt it out of
      // header modifications. We do this with an "allow" action at a higher
      // DNR priority than the modifyHeaders rules below: per DNR semantics, a
      // matching allow/allowAllRequests rule causes all modifyHeaders rules of
      // equal or lower priority to be ignored for that request, while leaving
      // the request itself completely unaffected (not blocked or redirected).
      const activeBlockedUrls = blockUrlsEnabled
        ? (activeProfile.blockedUrls || []).filter((b) => b.enabled && b.value)
        : [];

      for (const blocked of activeBlockedUrls) {
        try {
          new RegExp(blocked.value);
        } catch (e) {
          console.error(`Invalid regex: ${blocked.value}`, e);
          continue;
        }
        const condition = {
          regexFilter: blocked.value,
          resourceTypes: ALL_RESOURCE_TYPES,
        };
        const rule = {
          id: ruleId++,
          priority: 2,
          action: { type: "allow" },
          condition,
        };
        if (activeTabIds.length > 0) {
          sessionAdd.push({ ...rule, condition: { ...condition, tabIds: activeTabIds } });
        } else {
          dynamicAdd.push(rule);
        }
      }

      // Filter enabled headers
      const activeHeaders = (activeProfile.headers || []).filter(
        (h) => h.enabled && h.name,
      );

      // Build request and response header lists for DNR
      const requestHeaders = [];
      const responseHeaders = [];

      activeHeaders.forEach((h) => {
        const ruleHeader = {
          header: h.name,
          operation: h.action === "remove" ? "remove" : "set",
        };
        if (h.action !== "remove") {
          ruleHeader.value = h.value || "";
        }

        if (h.type === "request" && requestEnabled) {
          requestHeaders.push(ruleHeader);
        } else if (h.type === "response" && responseEnabled) {
          responseHeaders.push(ruleHeader);
        }
      });

      if (requestHeaders.length > 0 || responseHeaders.length > 0) {
        const buildAction = () => {
          const action = { type: "modifyHeaders" };
          if (requestHeaders.length > 0) action.requestHeaders = requestHeaders;
          if (responseHeaders.length > 0)
            action.responseHeaders = responseHeaders;
          return action;
        };

        // URL conditions: one per valid regex filter, or a single match-all.
        const activeFilters = filtersEnabled
          ? (activeProfile.filters || []).filter((f) => f.enabled && f.value)
          : [];
        const urlConditions = [];
        if (activeFilters.length === 0) {
          urlConditions.push({
            urlFilter: "*",
            resourceTypes: ALL_RESOURCE_TYPES,
          });
        } else {
          for (const filter of activeFilters) {
            try {
              new RegExp(filter.value);
            } catch (e) {
              console.error(`Invalid regex: ${filter.value}`, e);
              continue;
            }
            urlConditions.push({
              regexFilter: filter.value,
              resourceTypes: ALL_RESOURCE_TYPES,
            });
          }
        }

        for (const cond of urlConditions) {
          if (activeTabIds.length > 0) {
            sessionAdd.push({
              id: ruleId++,
              priority: 1,
              action: buildAction(),
              condition: { ...cond, tabIds: activeTabIds },
            });
          } else {
            dynamicAdd.push({
              id: ruleId++,
              priority: 1,
              action: buildAction(),
              condition: cond,
            });
          }
        }
      }
    }

    // Atomically swap old rules for new ones in a single call each to avoid
    // ID conflicts when concurrent rebuildRules calls interleave.
    const existingDynamic =
      await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingDynamic.map((r) => r.id),
      addRules: dynamicAdd,
    });

    const existingSession =
      await chrome.declarativeNetRequest.getSessionRules();
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: existingSession.map((r) => r.id),
      addRules: sessionAdd,
    });

    console.log(
      `Successfully updated rules. Dynamic: ${dynamicAdd.length}, Session: ${sessionAdd.length}`,
    );

    // Update extension badge / icon if necessary to indicate state
    updateExtensionUIState(enabled, activeProfile);
  } catch (error) {
    console.error("Error updating declarativeNetRequest rules:", error);
  }
}

function updateExtensionUIState(enabled, activeProfile) {
  if (!enabled) {
    chrome.action.setBadgeText({ text: "II" });
    chrome.action.setBadgeBackgroundColor({ color: "#4C566A" });
    chrome.action.setTitle({ title: "OpenHeader (Paused)" });
  } else if (!activeProfile) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#BF616A" });
    chrome.action.setTitle({ title: "OpenHeader (No Active Profile)" });
  } else {
    // Show active headers count on the badge
    const requestEnabled = activeProfile.requestEnabled !== false;
    const responseEnabled = activeProfile.responseEnabled !== false;
    const activeHeadersCount = (activeProfile.headers || []).filter((h) => {
      if (!h.enabled || !h.name) return false;
      if (h.type === "request" && !requestEnabled) return false;
      if (h.type === "response" && !responseEnabled) return false;
      return true;
    }).length;
    chrome.action.setBadgeText({ text: activeHeadersCount.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#A3BE8C" });
    chrome.action.setTitle({
      title: `OpenHeader (Active: ${activeProfile.name})`,
    });
  }
}

// Listen for storage changes to rebuild rules automatically
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local") {
    if (changes.profiles || changes.activeProfileId || changes.enabled) {
      rebuildRules();
    }
  }
});

// Rebuild rules when extension starts or installs
chrome.runtime.onInstalled.addListener(() => {
  // Initialize default configuration if storage is empty
  chrome.storage.local.get(
    ["profiles", "activeProfileId", "enabled"],
    (result) => {
      let updateNeeded = false;
      const updates = {};

      if (!result.profiles) {
        const defaultProfile = {
          id: "profile_" + Date.now(),
          name: "Profile 1",
          headers: [
            {
              id: "h_" + Date.now() + "_1",
              type: "request",
              action: "set",
              name: "X-Test-Header",
              value: "TestHeader",
              enabled: true,
            },
          ],
          filters: [],
        };
        updates.profiles = [defaultProfile];
        updates.activeProfileId = defaultProfile.id;
        updates.enabled = true;
        updateNeeded = true;
      }

      if (updateNeeded) {
        chrome.storage.local.set(updates, () => {
          rebuildRules();
        });
      } else {
        rebuildRules();
      }
    },
  );
});

chrome.runtime.onStartup.addListener(() => {
  rebuildRules();
});
