(function () {
  const ROUTE_SELECTOR = "[data-route]";
  const STORAGE_KEY = "greencarbon-logbook-farmers";
  const COLLECTED_AREAS_KEY = "greencarbon-collected-areas";
  const ACTIVE_PROFILE_KEY = "greencarbon-active-profile";
  const data = window.FARMER_APP_DATA || { meta: {}, farmers: [], polygons: [], groupSummary: [] };

  function navigate(route) {
    if (!route) return;
    window.location.href = route;
  }

  function toast(message) {
    const node = document.createElement("div");
    node.textContent = message;
    node.style.position = "fixed";
    node.style.right = "24px";
    node.style.bottom = "24px";
    node.style.zIndex = "9999";
    node.style.padding = "12px 16px";
    node.style.borderRadius = "14px";
    node.style.background = "rgba(21,28,39,0.9)";
    node.style.color = "#fff";
    node.style.fontFamily = "Inter, sans-serif";
    node.style.fontSize = "14px";
    node.style.fontWeight = "700";
    node.style.boxShadow = "0 12px 32px -4px rgba(21,28,39,0.2)";
    document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 1800);
  }

  function bindRoutes() {
    document.querySelectorAll(ROUTE_SELECTOR).forEach((element) => {
      if (element.dataset.routeBound === "true") return;
      element.dataset.routeBound = "true";
      element.addEventListener("click", function () {
        navigate(element.getAttribute("data-route"));
      });
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function setHTML(id, value) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = value;
  }

  function formatHa(value) {
    return `${Number(value).toFixed(2)} ha`;
  }

  function formatLogbookPopup(logbookData) {
    if (!logbookData || typeof logbookData !== "object") return "";
    const rows = [
      ["Date", logbookData.entryDate],
      ["Irrigation", logbookData.irrigationStatus],
      ["Water", logbookData.irrigationAmount],
      ["Drainage", logbookData.drainageStatus],
      ["Fertilizer", [logbookData.fertilizerType, logbookData.fertilizerAmount].filter(Boolean).join(" ")],
      ["Notes", logbookData.notes],
    ].filter((row) => row[1]);
    if (!rows.length) return "";
    return `<br>${rows.map(([label, value]) => `${label}: ${value}`).join("<br>")}`;
  }

  function normalizeGroupName(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getGroupTargets() {
    return (data.groupSummary || []).map((group) => ({
      fieldGroup: group.fieldGroup,
      totalAreaHa: Number(group.totalAreaHa) || 0,
      normalized: normalizeGroupName(group.fieldGroup),
    }));
  }

  function getInitialPolygonAssignments(groupTargets) {
    const sums = groupTargets.map(() => 0);
    const assignments = Array(data.polygons.length).fill(0);
    const ordered = data.polygons
      .map((polygon, index) => ({ index, areaHa: Number(polygon.areaHa) || 0 }))
      .sort((a, b) => b.areaHa - a.areaHa);

    ordered.forEach((polygon) => {
      let bestGroup = 0;
      let bestDelta = Number.POSITIVE_INFINITY;
      groupTargets.forEach((group, groupIndex) => {
        const next = sums[groupIndex] + polygon.areaHa;
        const delta = Math.abs(next - group.totalAreaHa) - Math.abs(sums[groupIndex] - group.totalAreaHa);
        if (delta < bestDelta) {
          bestDelta = delta;
          bestGroup = groupIndex;
        }
      });
      assignments[polygon.index] = bestGroup;
      sums[bestGroup] += polygon.areaHa;
    });

    return assignments;
  }

  function scorePolygonAssignments(assignments, groupTargets) {
    const sums = groupTargets.map(() => 0);
    assignments.forEach((groupIndex, polygonIndex) => {
      sums[groupIndex] += Number(data.polygons[polygonIndex].areaHa) || 0;
    });
    return sums.reduce((total, value, groupIndex) => total + Math.abs(value - groupTargets[groupIndex].totalAreaHa), 0);
  }

  function optimizePolygonAssignments(groupTargets) {
    const assignments = getInitialPolygonAssignments(groupTargets);
    let bestScore = scorePolygonAssignments(assignments, groupTargets);
    let improved = true;

    while (improved) {
      improved = false;

      for (let polygonIndex = 0; polygonIndex < assignments.length && !improved; polygonIndex += 1) {
        const originalGroup = assignments[polygonIndex];
        for (let candidateGroup = 0; candidateGroup < groupTargets.length; candidateGroup += 1) {
          if (candidateGroup === originalGroup) continue;
          assignments[polygonIndex] = candidateGroup;
          const score = scorePolygonAssignments(assignments, groupTargets);
          if (score < bestScore) {
            bestScore = score;
            improved = true;
            break;
          }
          assignments[polygonIndex] = originalGroup;
        }
      }

      for (let left = 0; left < assignments.length && !improved; left += 1) {
        for (let right = left + 1; right < assignments.length; right += 1) {
          if (assignments[left] === assignments[right]) continue;
          const originalLeft = assignments[left];
          const originalRight = assignments[right];
          assignments[left] = originalRight;
          assignments[right] = originalLeft;
          const score = scorePolygonAssignments(assignments, groupTargets);
          if (score < bestScore) {
            bestScore = score;
            improved = true;
            break;
          }
          assignments[left] = originalLeft;
          assignments[right] = originalRight;
        }
      }
    }

    return { assignments, score: bestScore };
  }

  function buildPredictionModel(farmers) {
    const groupTargets = getGroupTargets();
    if (!groupTargets.length || !data.polygons.length) {
      return { farmerPredictions: [], polygonPredictions: {} };
    }

    const optimized = optimizePolygonAssignments(groupTargets);
    const polygonsByGroup = {};
    const polygonPredictions = {};
    groupTargets.forEach((group) => {
      polygonsByGroup[group.fieldGroup] = [];
    });

    optimized.assignments.forEach((groupIndex, polygonIndex) => {
      const polygon = data.polygons[polygonIndex];
      const fieldGroup = groupTargets[groupIndex].fieldGroup;
      const enriched = {
        polygonId: polygon.polygonId,
        label: polygon.label,
        areaHa: Number(polygon.areaHa) || 0,
        remainingHa: Number(polygon.areaHa) || 0,
        farmerCount: 0,
        matchedAreaHa: 0,
        predictedGroup: fieldGroup,
      };
      polygonsByGroup[fieldGroup].push(enriched);
      polygonPredictions[polygon.polygonId] = enriched;
    });

    const groupsByName = Object.fromEntries(groupTargets.map((group) => [group.normalized, group.fieldGroup]));
    const farmerPredictions = Array(farmers.length);
    const groupedFarmers = {};
    groupTargets.forEach((group) => {
      groupedFarmers[group.fieldGroup] = [];
    });

    farmers.forEach((farmer, index) => {
      const exactGroup = groupsByName[normalizeGroupName(farmer.fieldGroup)];
      const predictedGroup =
        exactGroup ||
        groupTargets.reduce((best, group) => {
          if (!best) return group;
          const farmerArea = Number(farmer.areaHa) || 0;
          const bestDelta = Math.abs(best.totalAreaHa - farmerArea);
          const nextDelta = Math.abs(group.totalAreaHa - farmerArea);
          return nextDelta < bestDelta ? group : best;
        }, null)?.fieldGroup ||
        groupTargets[0].fieldGroup;

      groupedFarmers[predictedGroup].push({
        index,
        farmer,
      });
    });

    groupTargets.forEach((group) => {
      const polygonPool = (polygonsByGroup[group.fieldGroup] || []).slice();
      const sortedFarmers = (groupedFarmers[group.fieldGroup] || []).sort(
        (left, right) => (Number(right.farmer.areaHa) || 0) - (Number(left.farmer.areaHa) || 0)
      );

      sortedFarmers.forEach(({ index, farmer }) => {
        const farmerArea = Number(farmer.areaHa) || 0;
        let bestPolygon = polygonPool[0] || null;
        let bestScore = Number.POSITIVE_INFINITY;

        polygonPool.forEach((polygon) => {
          const overflow = Math.max(0, farmerArea - polygon.remainingHa);
          const leftover = Math.abs(polygon.remainingHa - farmerArea);
          const score = overflow * 4 + leftover;
          if (score < bestScore) {
            bestScore = score;
            bestPolygon = polygon;
          }
        });

        if (!bestPolygon) {
          farmerPredictions[index] = {
            predictedGroup: group.fieldGroup,
            predictedPolygonId: "Unmatched",
            confidence: "Low",
            areaDeltaHa: farmerArea,
          };
          return;
        }

        const areaDeltaHa = Math.abs(bestPolygon.remainingHa - farmerArea);
        const relativeDelta = areaDeltaHa / Math.max(farmerArea, bestPolygon.areaHa, 0.01);
        let confidence = "High";
        if (bestPolygon.remainingHa < farmerArea || relativeDelta > 0.3) {
          confidence = "Low";
        } else if (relativeDelta > 0.12) {
          confidence = "Medium";
        }

        bestPolygon.remainingHa = Math.max(0, bestPolygon.remainingHa - farmerArea);
        bestPolygon.farmerCount += 1;
        bestPolygon.matchedAreaHa += farmerArea;

        farmerPredictions[index] = {
          predictedGroup: group.fieldGroup,
          predictedPolygonId: bestPolygon.polygonId,
          confidence,
          areaDeltaHa,
        };
      });
    });

    return {
      farmerPredictions,
      polygonPredictions,
      assignmentScore: optimized.score,
    };
  }

  function buildLogEntriesFromFarmers() {
    const dateOffsets = [0, 3, 8];
    const baseFarmer = (data.farmers || [])[0];
    if (!baseFarmer) return [];
    return dateOffsets.map((offset, entryIndex) => ({
      farmerName: "Amina Kato",
      farmerId: baseFarmer.farmerId,
      fieldGroup: baseFarmer.fieldGroup,
      entryDate: `2026-04-${String(19 - offset).padStart(2, "0")}`,
      areaHa: Number(baseFarmer.areaHa) || 0,
      areaM2: Number(baseFarmer.areaM2) || 0,
      irrigationStatus: placeholderIrrigation(entryIndex).watered,
      irrigationAmount: placeholderIrrigation(entryIndex).amount,
      drainageStatus: placeholderDrainage(entryIndex),
      fertilizerType: placeholderFertilizer(entryIndex).type,
      fertilizerAmount: placeholderFertilizer(entryIndex).amount,
      notes: placeholderNotes(entryIndex),
    }));
  }

  function readFarmers() {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return buildLogEntriesFromFarmers();
    try {
      return JSON.parse(stored);
    } catch {
      return buildLogEntriesFromFarmers();
    }
  }

  function writeFarmers(farmers) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(farmers));
  }

  function readActiveProfile() {
    const stored = window.localStorage.getItem(ACTIVE_PROFILE_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  function writeActiveProfile(profile) {
    window.localStorage.setItem(
      ACTIVE_PROFILE_KEY,
      JSON.stringify({
        farmerName: profile.farmerName,
        farmerId: profile.farmerId,
        fieldGroup: profile.fieldGroup,
      })
    );
  }

  function getSignedInFarmer() {
    const activeProfile = readActiveProfile();
    if (!activeProfile?.farmerId) return null;
    return readFarmers().find((farmer) => farmer.farmerId === activeProfile.farmerId) || activeProfile;
  }

  function getFarmerLogbookData(farmer) {
    return {
      entryDate: farmer.entryDate || "",
      irrigationStatus: farmer.irrigationStatus || "",
      irrigationAmount: farmer.irrigationAmount || "",
      drainageStatus: farmer.drainageStatus || "",
      fertilizerType: farmer.fertilizerType || "",
      fertilizerAmount: farmer.fertilizerAmount || "",
      notes: farmer.notes || "",
      areaHa: Number(farmer.areaHa || 0),
      areaM2: Number(farmer.areaM2 || 0),
    };
  }

  function readCollectedAreas() {
    const stored = window.localStorage.getItem(COLLECTED_AREAS_KEY);
    if (!stored) return [];
    try {
      const areas = JSON.parse(stored);
      return Array.isArray(areas) ? areas : [];
    } catch {
      return [];
    }
  }

  function writeCollectedAreas(areas) {
    window.localStorage.setItem(COLLECTED_AREAS_KEY, JSON.stringify(areas));
  }

  function saveCollectedArea(latlngs) {
    const areaHa = calculatePolygonAreaHa(latlngs);
    const areas = readCollectedAreas();
    const localId = `collected-${Date.now()}`;
    const farmer = getSignedInFarmer();
    const collectedArea = {
      localId,
      polygonId: `Collected ${areas.length + 1}`,
      label: `Collected ${areas.length + 1}, ${areaHa.toFixed(2)} ha`,
      areaHa,
      areaM2: areaHa * 10000,
      latlngs,
      farmerId: farmer?.farmerId || "",
      farmerName: farmer?.farmerName || "",
      fieldGroup: farmer?.fieldGroup || "",
      logbookData: farmer ? getFarmerLogbookData(farmer) : {},
      createdAt: new Date().toISOString(),
      synced: false,
    };
    writeCollectedAreas([...areas, collectedArea]);
    return collectedArea;
  }

  function markCollectedAreaSynced(localId, supabaseId) {
    writeCollectedAreas(
      readCollectedAreas().map((area) =>
        area.localId === localId
          ? {
              ...area,
              supabaseId,
              synced: true,
            }
          : area
      )
    );
  }

  function getNextFarmerId(farmers) {
    const nextNumber =
      farmers.reduce((highest, farmer) => {
        const match = String(farmer.farmerId || "").match(/\d+/);
        return match ? Math.max(highest, Number(match[0])) : highest;
      }, 0) + 1;
    return `Farmer ${nextNumber}`;
  }

  function mergeProfileWithLogEntry(profile, fallback, index) {
    return {
      ...(fallback || {}),
      farmerName: profile.name || fallback?.farmerName || placeholderFarmerName(index),
      farmerId: profile.farmer_id || profile.farmerId || fallback?.farmerId || `Farmer ${index + 1}`,
      fieldGroup: profile.field_group || profile.fieldGroup || fallback?.fieldGroup || "Group A",
      ...(profile.logbook_data || profile.logbookData || {}),
    };
  }

  function profileSortValue(farmerId) {
    const match = String(farmerId || "").match(/\d+/);
    return match ? Number(match[0]) : Number.MAX_SAFE_INTEGER;
  }

  async function fetchSupabaseFarmers() {
    const response = await fetch("/api/farmer-profiles");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load Supabase farmer profiles");
    }
    return (payload.profiles || [])
      .slice()
      .sort((left, right) => profileSortValue(left.farmer_id) - profileSortValue(right.farmer_id));
  }

  async function loadFarmersFromSupabase() {
    const profiles = await fetchSupabaseFarmers();
    if (!profiles.length) return readFarmers();
    const localFarmers = readFarmers();
    const nextFarmers = profiles.map((profile, index) => mergeProfileWithLogEntry(profile, localFarmers[index], index));
    writeFarmers(nextFarmers);
    return nextFarmers;
  }

  async function syncFarmersToSupabase(farmers) {
    const response = await fetch("/api/farmer-profiles/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        profiles: farmers.map((farmer) => ({
          ...farmer,
          logbookData: getFarmerLogbookData(farmer),
        })),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to save farmer profiles to Supabase");
    }
    return payload.profiles || [];
  }

  function normalizeSupabasePolygon(polygon, index) {
    const areaHa = Number(polygon.area_ha || 0);
    return {
      polygonId: `Saved ${polygon.id || index + 1}`,
      label: `Saved field, ${areaHa.toFixed(2)} ha`,
      areaHa,
      areaM2: areaHa * 10000,
      latlngs: Array.isArray(polygon.latlngs) ? polygon.latlngs : [],
      farmerId: polygon.farmer_id || "",
      farmerName: polygon.farmer_name || "",
      fieldGroup: polygon.field_group || "",
      logbookData: polygon.logbook_data || {},
      createdAt: polygon.created_at || "",
    };
  }

  async function ensureSignedInProfile() {
    const farmer = getSignedInFarmer();
    if (farmer) return farmer;
    toast("Create a farmer profile before drawing");
    return promptProfileCreation();
  }

  async function fetchSupabaseFieldPolygons() {
    const response = await fetch("/api/field-polygons");
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to load field polygons from Supabase");
    }
    return (payload.polygons || []).map(normalizeSupabasePolygon);
  }

  async function syncCollectedAreaToSupabase(collectedArea) {
    const farmer = getSignedInFarmer();
    if (!farmer) {
      throw new Error("Create a farmer profile before saving a field polygon");
    }
    const response = await fetch("/api/field-polygons", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        farmerId: farmer.farmerId,
        farmerName: farmer.farmerName,
        fieldGroup: farmer.fieldGroup,
        areaHa: collectedArea.areaHa,
        latlngs: collectedArea.latlngs,
        logbookData: getFarmerLogbookData(farmer),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to save field polygon to Supabase");
    }
    return payload.polygon;
  }

  async function promptProfileCreation() {
    const farmers = readFarmers();
    const farmerName = window.prompt("Create profile\n\nFarmer name");
    if (!farmerName) return;
    const farmerId = window.prompt("Farmer ID", getNextFarmerId(farmers));
    if (!farmerId) return;
    const fieldGroup = window.prompt("Field group", data.groupSummary?.[0]?.fieldGroup || "Group A");
    if (!fieldGroup) return;

    const nextFarmer = {
      farmerName: farmerName.trim(),
      entryDate: new Date().toISOString().slice(0, 10),
      farmerId: farmerId.trim(),
      fieldGroup: fieldGroup.trim(),
      areaHa: 0,
      areaM2: 0,
      irrigationStatus: "Not watered",
      irrigationAmount: "0 L",
      drainageStatus: "Good",
      fertilizerType: "Urea",
      fertilizerAmount: "10 kg",
      notes: "New profile.",
    };
    const nextFarmers = [...farmers, nextFarmer];
    writeFarmers(nextFarmers);
    writeActiveProfile(nextFarmer);

    const tableBody = document.getElementById("logbook-table-body");
    if (tableBody) {
      renderLogbookTable(tableBody, nextFarmers);
      syncLogbookSummary(nextFarmers);
    }

    try {
      await syncFarmersToSupabase(nextFarmers);
      toast("Profile created and signed in");
    } catch {
      toast("Profile created locally and signed in");
    }
    return nextFarmer;
  }

  function bindProfileCreation() {
    document.querySelectorAll("[data-profile-create]").forEach((element) => {
      if (element.dataset.profileCreateBound === "true") return;
      element.dataset.profileCreateBound = "true";
      element.addEventListener("click", promptProfileCreation);
      element.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        promptProfileCreation();
      });
    });
  }

  function summaryPage() {
    if (!document.getElementById("summary-card-1-title")) return;
    const farmers = readFarmers();
    setText("summary-card-1-title", "Registered Farmers");
    setText("summary-card-1-copy", `${farmers.length} farmers across ${data.groupSummary.length} groups`);
    setText("summary-card-2-title", "Mapped Polygon Review");
    setText("summary-card-2-copy", `${data.meta.polygonCount} project polygons with a ${data.meta.areaGapHa.toFixed(2)} ha gap`);
    setText("summary-map-label", `${data.meta.polygonCount} mapped areas`);
    setHTML("summary-stat-1-value", `${data.meta.totalFarmerAreaHa.toFixed(2)}<span class="text-xl">ha</span>`);
    setText("summary-stat-1-label", "Declared by farmers");
    setHTML("summary-stat-2-value", `${data.meta.totalPolygonAreaHa.toFixed(2)}<span class="text-xl">ha</span>`);
    setText("summary-stat-2-label", "Measured from polygons");
    setText("summary-stat-3-value", `${data.meta.areaGapHa.toFixed(4)} ha gap`);
    createLeafletMap("summary-leaflet-map", false, {
      padding: [16, 16],
      includeCollected: true,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      touchZoom: true,
      boxZoom: true,
      dragging: true,
    });
  }

  function renderStatusChip(status) {
    if (status === "High") {
      return '<span class="inline-flex items-center gap-1.5 bg-primary-fixed text-on-primary-fixed px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"><span class="material-symbols-outlined text-xs" style="font-variation-settings: \'FILL\' 1;">check_circle</span>High</span>';
    }
    if (status === "Medium") {
      return '<span class="inline-flex items-center gap-1.5 bg-secondary-fixed text-on-secondary-fixed px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"><span class="material-symbols-outlined text-xs">rule</span>Medium</span>';
    }
    return '<span class="inline-flex items-center gap-1.5 bg-tertiary-fixed text-on-tertiary-fixed px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider"><span class="material-symbols-outlined text-xs">priority_high</span>Low</span>';
  }

  function placeholderFarmerName(index) {
    const firstNames = ["Amina", "Joseph", "Grace", "Daniel", "Miriam", "Peter", "Esther", "Samuel", "Ruth", "David"];
    const lastNames = ["Kato", "Nantume", "Okello", "Achieng", "Mwesige", "Nabwire", "Tumusiime", "Atieno", "Wekesa", "Nalongo"];
    return `${firstNames[index % firstNames.length]} ${lastNames[(index * 3) % lastNames.length]}`;
  }

  function placeholderIrrigation(index) {
    const watered = index % 3 !== 0;
    const liters = [180, 240, 320, 410, 275, 360][index % 6];
    return {
      watered: watered ? "Watered" : "Not watered",
      amount: watered ? `${liters} L` : "0 L",
    };
  }

  function placeholderDrainage(index) {
    return ["Good", "Moderate", "Slow", "Needs clearing"][index % 4];
  }

  function placeholderFertilizer(index) {
    const types = ["Urea", "NPK 17-17-17", "Compost", "DAP", "Manure"];
    const amounts = ["12 kg", "18 kg", "25 kg", "9 kg", "15 kg"];
    return {
      type: types[index % types.length],
      amount: amounts[(index * 2) % amounts.length],
    };
  }

  function placeholderNotes(index) {
    const notes = [
      "Routine morning field check.",
      "Observed slightly wetter soil near the edge.",
      "No issues reported by field team.",
      "Follow-up fertilizer pass planned next week.",
      "Drainage channel should be monitored after rain.",
    ];
    return notes[index % notes.length];
  }

  function getLogbookEntry(farmer, index) {
    const irrigation = placeholderIrrigation(index);
    const fertilizer = placeholderFertilizer(index);
    return {
      farmerName: farmer.farmerName || placeholderFarmerName(index),
      entryDate: farmer.entryDate || `2026-04-${String(19 - (index % 9)).padStart(2, "0")}`,
      irrigationStatus: farmer.irrigationStatus || irrigation.watered,
      irrigationAmount: farmer.irrigationAmount || irrigation.amount,
      drainageStatus: farmer.drainageStatus || placeholderDrainage(index),
      fertilizerType: farmer.fertilizerType || fertilizer.type,
      fertilizerAmount: farmer.fertilizerAmount || fertilizer.amount,
      notes: farmer.notes || placeholderNotes(index),
    };
  }

  function createFarmerRow(farmer, index) {
    const entry = getLogbookEntry(farmer, index);
    const tr = document.createElement("tr");
    tr.className = "hover:bg-surface-container-low/30 transition-colors group";
    tr.innerHTML = `
      <td class="px-8 py-5">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-lg overflow-hidden shrink-0 border border-outline-variant/20 bg-surface-container-low flex items-center justify-center text-[10px] font-black text-primary">${farmer.farmerId.replace("Farmer ", "F")}</div>
          <span class="font-semibold text-on-surface" contenteditable="true" spellcheck="false">${entry.farmerName}</span>
        </div>
      </td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.entryDate}</td>
      <td class="px-8 py-5 font-mono text-sm" contenteditable="true" spellcheck="false">${farmer.farmerId}</td>
      <td class="px-8 py-5 font-mono text-sm" contenteditable="true" spellcheck="false">${farmer.fieldGroup}</td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.irrigationStatus}</td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.irrigationAmount}</td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.drainageStatus}</td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.fertilizerType}</td>
      <td class="px-8 py-5 text-sm font-medium" contenteditable="true" spellcheck="false">${entry.fertilizerAmount}</td>
      <td class="px-8 py-5 text-sm text-on-surface-variant" contenteditable="true" spellcheck="false">${entry.notes}</td>
      <td class="px-8 py-5 text-right">
        <button class="text-on-surface-variant opacity-100 transition-opacity p-2 hover:bg-surface-container-low rounded-lg" data-route="/map">
          <span class="material-symbols-outlined text-xl">more_vert</span>
        </button>
      </td>
    `;
    return tr;
  }

  function collectFarmers(body) {
    return [...body.querySelectorAll("tr")].map((row) => {
      const cells = row.querySelectorAll("td");
      return {
        farmerName: cells[0]?.innerText.trim().split("\n").pop() || "",
        entryDate: cells[1]?.innerText.trim() || "",
        farmerId: cells[2]?.innerText.trim() || "",
        fieldGroup: cells[3]?.innerText.trim() || "",
        areaHa: 0,
        areaM2: 0,
        irrigationStatus: cells[4]?.innerText.trim() || "",
        irrigationAmount: cells[5]?.innerText.trim() || "",
        drainageStatus: cells[6]?.innerText.trim() || "",
        fertilizerType: cells[7]?.innerText.trim() || "",
        fertilizerAmount: cells[8]?.innerText.trim() || "",
        notes: cells[9]?.innerText.trim() || "",
      };
    });
  }

  function renderLogbookTable(body, farmers) {
    farmers = farmers || readFarmers();
    body.innerHTML = "";
    farmers.forEach((farmer, index) => body.appendChild(createFarmerRow(farmer, index)));
    bindRoutes();
  }

  function syncLogbookSummary(farmers) {
    setText("logbook-summary-1-label", "Log Entries");
    setHTML("logbook-summary-1-value", `${farmers.length} <span class="text-lg font-medium opacity-50">entries</span>`);
    setText("logbook-summary-2-label", "Individual Farmers");
    setHTML("logbook-summary-2-value", `${data.meta.farmerCount} <span class="text-lg font-medium opacity-50">farmers</span>`);
    setText("logbook-summary-3-label", "Farmer Groups");
    setHTML("logbook-summary-3-value", `${data.groupSummary.length}<span class="text-lg font-medium opacity-50"> groups</span>`);
  }

  async function refreshLogbookFromSupabase(body) {
    const farmers = await loadFarmersFromSupabase();
    renderLogbookTable(body, farmers);
    syncLogbookSummary(farmers);
    return farmers;
  }

  function logbookPage() {
    const thead = document.getElementById("logbook-table-head");
    const body = document.getElementById("logbook-table-body");
    const addRowButton = document.getElementById("add-row-button");
    const saveButton = document.getElementById("save-button");
    const cancelButton = document.getElementById("cancel-button");
    if (!thead || !body) return;
    const farmers = readFarmers();

    thead.innerHTML = `
      <tr class="bg-surface-container-low/50">
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Farmer Name</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Date</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Farmer ID</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Group</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Irrigation</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Water Amount</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Drainage Status</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Fertilizer Type</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Fertilizer Amount</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20">Optional Notes</th>
        <th class="px-8 py-5 text-xs font-bold uppercase tracking-widest text-on-surface-variant border-b border-outline-variant/20 text-right">Actions</th>
      </tr>
    `;

    renderLogbookTable(body, farmers);
    syncLogbookSummary(farmers);

    refreshLogbookFromSupabase(body)
      .then((supabaseFarmers) => {
        toast("Connected to Supabase");
      })
      .catch(() => {
        toast("Using local farmer data");
      });

    if (addRowButton && !addRowButton.dataset.bound) {
      addRowButton.dataset.bound = "true";
      addRowButton.addEventListener("click", function () {
        body.appendChild(
          createFarmerRow(
            {
              farmerName: placeholderFarmerName(body.querySelectorAll("tr").length),
              entryDate: "2026-04-19",
              farmerId: `Farmer ${readFarmers().length + body.querySelectorAll("tr").length + 1}`,
              fieldGroup: "Group A",
              irrigationStatus: "Not watered",
              irrigationAmount: "0 L",
              drainageStatus: "Good",
              fertilizerType: "Urea",
              fertilizerAmount: "10 kg",
              notes: "New placeholder log entry.",
            },
            body.querySelectorAll("tr").length
          )
        );
        bindRoutes();
        const lastEditable = body.querySelector("tr:last-child [contenteditable='true']");
        if (lastEditable) lastEditable.focus();
        toast("New farmer row added");
      });
    }

    if (saveButton && !saveButton.dataset.bound) {
      saveButton.dataset.bound = "true";
      saveButton.addEventListener("click", async function () {
        const farmersToSave = collectFarmers(body);
        writeFarmers(farmersToSave);
        saveButton.disabled = true;
        try {
          await syncFarmersToSupabase(farmersToSave);
          toast("Farmer logbook saved to Supabase");
        } catch {
          toast("Saved locally; Supabase sync failed");
        } finally {
          saveButton.disabled = false;
        }
      });
    }

    if (cancelButton && !cancelButton.dataset.bound) {
      cancelButton.dataset.bound = "true";
      cancelButton.addEventListener("click", function () {
        renderLogbookTable(body);
        toast("Restored imported farmer data");
      });
    }

    if (window.location.hash === "#add-row" && addRowButton) {
      addRowButton.click();
      addRowButton.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function polygonColor(index) {
    const fills = ["#006c49", "#855300", "#b91a24", "#4267b2"];
    return fills[index % fills.length];
  }

  function calculatePolygonAreaHa(latlngs) {
    if (!latlngs || latlngs.length < 3) return 0;
    const earthRadius = 6378137;
    const meanLat =
      latlngs.reduce((sum, point) => sum + point[0], 0) / latlngs.length;
    const metersPerDegLat = (Math.PI / 180) * earthRadius;
    const metersPerDegLng = metersPerDegLat * Math.cos((meanLat * Math.PI) / 180);

    const points = latlngs.map(([lat, lng]) => ({
      x: lng * metersPerDegLng,
      y: lat * metersPerDegLat,
    }));

    let area = 0;
    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      area += current.x * next.y - next.x * current.y;
    }

    return Math.abs(area / 2) / 10000;
  }

  function distanceBetweenLatLng(a, b) {
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const latScale = 111320;
    const avgLat = ((a.lat + b.lat) / 2) * (Math.PI / 180);
    const lngScale = 111320 * Math.cos(avgLat);
    const dx = (a.lng - b.lng) * lngScale;
    const dy = (a.lat - b.lat) * latScale;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function setButtonActive(button, isActive) {
    if (!button) return;
    button.classList.toggle("bg-white", isActive);
    button.classList.toggle("dark:bg-[#2d3748]", isActive);
    button.classList.toggle("text-[#006c49]", isActive);
    button.classList.toggle("shadow-sm", isActive);
    button.classList.toggle("scale-105", isActive);
    button.classList.toggle("text-[#151c27]/40", !isActive);
    button.classList.toggle("dark:text-[#f9f9ff]/40", !isActive);
    button.classList.toggle("hover:bg-white/50", !isActive);
    button.classList.toggle("dark:hover:bg-[#2d3748]/50", !isActive);
  }

  function createLeafletMap(containerId, highlightLargest, options) {
    if (!window.L || !data.polygons.length) return null;
    const container = document.getElementById(containerId);
    if (!container || container.dataset.mapReady === "true") return null;
    container.dataset.mapReady = "true";
    const mapOptions = options || {};

    const largest = data.polygons.reduce((best, polygon) => (!best || polygon.areaHa > best.areaHa ? polygon : best), null);
    const collectedAreas = mapOptions.includeCollected ? readCollectedAreas().filter((area) => !area.synced) : [];
    const visiblePolygons = [...data.polygons, ...collectedAreas];
    const bounds = [
      [data.meta.bounds.south, data.meta.bounds.west],
      [data.meta.bounds.north, data.meta.bounds.east],
    ];

    const map = window.L.map(containerId, {
      zoomControl: mapOptions.zoomControl !== false,
      attributionControl: mapOptions.attributionControl !== false,
      scrollWheelZoom: mapOptions.scrollWheelZoom !== false,
      doubleClickZoom: mapOptions.doubleClickZoom !== false,
      touchZoom: mapOptions.touchZoom !== false,
      boxZoom: mapOptions.boxZoom !== false,
      dragging: mapOptions.dragging !== false,
    });

    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const featureGroup = window.L.featureGroup().addTo(map);
    const predictionModel = buildPredictionModel(readFarmers());

    function addCollectedAreaLayer(polygon) {
      const layer = window.L.polygon(polygon.latlngs, {
        color: "#1f78ff",
        weight: 3,
        fillColor: "#1f78ff",
        fillOpacity: 0.22,
      }).addTo(featureGroup);

      const farmerLine = polygon.farmerName ? `<br>${polygon.farmerName} · ${polygon.fieldGroup || "Unassigned"}` : "";
      layer.bindPopup(`<strong>${polygon.polygonId}</strong><br>${polygon.label}${farmerLine}<br>Collected field${formatLogbookPopup(polygon.logbookData)}`);
      return layer;
    }

    data.polygons.forEach((polygon, index) => {
      const isLargest = largest && polygon.polygonId === largest.polygonId;
      const color = highlightLargest && isLargest ? "#ba1a1a" : polygonColor(index);
      const polygonPrediction = predictionModel.polygonPredictions?.[polygon.polygonId];
      const layer = window.L.polygon(polygon.latlngs, {
        color,
        weight: highlightLargest && isLargest ? 4 : 2,
        dashArray: highlightLargest && isLargest ? "8 8" : null,
        fillColor: color,
        fillOpacity: highlightLargest && isLargest ? 0.3 : 0.22,
      }).addTo(featureGroup);

      layer.bindPopup(
        `<strong>${polygon.polygonId}</strong><br>${polygon.label}<br>${polygon.areaHa.toFixed(2)} ha<br>Predicted group: ${polygonPrediction?.predictedGroup || "Unassigned"}<br>Predicted farmers: ${polygonPrediction?.farmerCount || 0}`
      );
    });

    collectedAreas.forEach(addCollectedAreaLayer);

    let didFitVisibleBounds = false;
    if (visiblePolygons.length && collectedAreas.length) {
      const collectedBounds = window.L.latLngBounds([]);
      visiblePolygons.forEach((polygon) => {
        (polygon.latlngs || []).forEach((point) => collectedBounds.extend(point));
      });
      if (collectedBounds.isValid()) {
        map.fitBounds(collectedBounds, { padding: mapOptions.padding || [24, 24] });
        window.setTimeout(() => map.invalidateSize(), 120);
        didFitVisibleBounds = true;
      }
    }

    if (!didFitVisibleBounds) {
      map.fitBounds(bounds, { padding: mapOptions.padding || [24, 24] });
      window.setTimeout(() => map.invalidateSize(), 120);
    }

    if (mapOptions.includeCollected) {
      fetchSupabaseFieldPolygons()
        .then((polygons) => {
          polygons.filter((polygon) => polygon.latlngs.length).forEach(addCollectedAreaLayer);
          const allBounds = featureGroup.getBounds();
          if (allBounds.isValid()) map.fitBounds(allBounds, { padding: mapOptions.padding || [24, 24] });
        })
        .catch(() => {});
    }

    return { map, largest };
  }

  function createDrawingMap(containerId) {
    if (!window.L) return null;
    const container = document.getElementById(containerId);
    if (!container || container.dataset.mapReady === "true") return null;
    container.dataset.mapReady = "true";

    const map = window.L.map(containerId, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: false,
      touchZoom: "center",
      boxZoom: false,
      dragging: true,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
    });

    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    const sampleSpot = [
      data.meta?.bounds?.center?.[0] ? data.meta.bounds.center[0] + 0.00085 : 18.8807,
      data.meta?.bounds?.center?.[1] ? data.meta.bounds.center[1] + 0.00055 : 105.5126,
    ];

    const state = {
      points: [],
      draftLine: window.L.polyline([], {
        color: "#1f78ff",
        weight: 4,
        opacity: 0.95,
      }).addTo(map),
      pointMarkers: [],
      collectedPolygon: null,
      drawingEnabled: false,
      sampleSpot,
      isSketching: false,
      lastDrawLatLng: null,
      suppressClickUntil: 0,
      collectedAreaSaved: false,
    };

    map.setView(sampleSpot, 16.5);

    function syncCursor() {
      container.classList.toggle("is-drawing", state.drawingEnabled);
    }

    function syncPanel() {
      const pointCount = state.points.length;
      const areaHa = pointCount >= 3 ? calculatePolygonAreaHa(state.points) : 0;
      const canClose = pointCount >= 3;
      setText("map-panel-title", state.collectedPolygon ? "Collected Field" : "Draw Field Boundary");
      setText(
        "map-panel-subtitle",
        pointCount
          ? `${pointCount} boundary points placed`
          : state.drawingEnabled
            ? "Click and drag to sketch boundary lines"
            : "Drag the map to move around, then click Draw to sketch"
      );
      setText("map-panel-area", formatHa(areaHa));
      setText(
        "map-panel-status",
        state.collectedPolygon ? "Collected" : state.drawingEnabled ? (pointCount >= 3 ? "Ready to Collect" : "Drawing") : "Browse Map"
      );
      setText(
        "map-panel-check-title",
        state.collectedPolygon ? "Field polygon saved on map" : state.drawingEnabled ? "Drawing mode is active" : "Pan mode is active"
      );
      setText(
        "map-panel-check-copy",
        state.collectedPolygon
          ? "The sketched boundary has been closed and shaded as a field area."
          : !state.drawingEnabled
            ? "You can drag the map freely. Click the Draw tool when you want to start sketching a field."
          : canClose
            ? "Return to the starting point or press Collect Area to close the polygon and shade it."
            : "Click and drag with your cursor to sketch the boundary, then collect it into a shaded field."
      );
    }

    function redrawDraft() {
      state.draftLine.setLatLngs(state.points);
      syncPanel();
    }

    function getFirstLatLng() {
      if (!state.points.length) return null;
      return window.L.latLng(state.points[0][0], state.points[0][1]);
    }

    function shouldCloseAt(latlng) {
      if (state.points.length < 3) return false;
      return distanceBetweenLatLng(getFirstLatLng(), latlng) < 10;
    }

    function addPoint(latlng, force) {
      if (!state.drawingEnabled || state.collectedPolygon) return;
      if (shouldCloseAt(latlng)) {
        collectArea();
        stopSketch();
        return;
      }
      if (!force && distanceBetweenLatLng(state.lastDrawLatLng, latlng) < 6) return;
      state.points.push([latlng.lat, latlng.lng]);
      const marker = window.L.circleMarker(latlng, {
        radius: 5,
        color: "#ffffff",
        weight: 2,
        fillColor: "#1f78ff",
        fillOpacity: 1,
      }).addTo(map);
      state.pointMarkers.push(marker);
      state.lastDrawLatLng = latlng;
      redrawDraft();
    }

    function startSketch(latlng) {
      if (!state.drawingEnabled || state.collectedPolygon) return;
      if (!getSignedInFarmer()) {
        state.drawingEnabled = false;
        syncCursor();
        syncPanel();
        toast("Create a farmer profile before drawing");
        return;
      }
      state.isSketching = true;
      state.lastDrawLatLng = null;
      map.dragging.disable();
      addPoint(latlng, true);
    }

    function extendSketch(latlng) {
      if (!state.isSketching) return;
      addPoint(latlng, false);
    }

    function stopSketch() {
      if (!state.isSketching) return;
      state.isSketching = false;
      state.suppressClickUntil = Date.now() + 250;
      map.dragging.enable();
    }

    function clearDraft() {
      state.points = [];
      state.draftLine.setLatLngs([]);
      state.pointMarkers.forEach((marker) => marker.remove());
      state.pointMarkers = [];
      state.lastDrawLatLng = null;
      state.isSketching = false;
      if (state.collectedPolygon) {
        state.collectedPolygon.remove();
        state.collectedPolygon = null;
      }
      state.collectedAreaSaved = false;
      map.dragging.enable();
      syncPanel();
    }

    function collectArea() {
      if (!getSignedInFarmer()) {
        toast("Create a farmer profile before collecting an area");
        return;
      }

      if (state.points.length < 3) {
        toast("Add at least three points before collecting an area");
        return;
      }

      if (state.collectedAreaSaved) {
        toast("Area is already on the summary map");
        return;
      }

      if (state.collectedPolygon) {
        state.collectedPolygon.remove();
      }

      state.collectedPolygon = window.L.polygon(state.points, {
        color: "#006c49",
        weight: 3,
        fillColor: "#10b981",
        fillOpacity: 0.28,
      }).addTo(map);
      const collectedArea = saveCollectedArea(state.points);
      state.collectedAreaSaved = true;
      state.collectedPolygon.bindPopup(`Collected field<br>${formatHa(collectedArea.areaHa)}`);
      state.draftLine.setLatLngs([...state.points, state.points[0]]);
      syncPanel();
      toast("Area collected and added to summary map");
      syncCollectedAreaToSupabase(collectedArea)
        .then((polygon) => {
          markCollectedAreaSynced(collectedArea.localId, polygon.id);
          toast("Field saved to Supabase");
        })
        .catch(() => {
          toast("Field saved locally; Supabase sync failed");
        });
    }

    map.on("mousedown", function (event) {
      if (event.originalEvent?.button && event.originalEvent.button !== 0) return;
      startSketch(event.latlng);
    });

    map.on("mousemove", function (event) {
      extendSketch(event.latlng);
    });

    map.on("mouseup", function () {
      stopSketch();
    });

    map.on("mouseout", function () {
      stopSketch();
    });

    document.addEventListener("mouseup", stopSketch);

    map.on("click", function (event) {
      if (Date.now() < state.suppressClickUntil) return;
      addPoint(event.latlng, true);
    });

    return {
      map,
      sampleSpot,
      clearDraft,
      collectArea,
      focusSampleSpot: function () {
        map.flyTo(sampleSpot, 17, { duration: 0.8 });
      },
      setDrawingEnabled: function (enabled) {
        if (enabled && !getSignedInFarmer()) {
          state.drawingEnabled = false;
          syncCursor();
          syncPanel();
          toast("Create a farmer profile before drawing");
          return false;
        }
        state.drawingEnabled = enabled;
        syncCursor();
        syncPanel();
        return true;
      },
      syncPanel,
    };
  }

  function mapPage() {
    if (!document.getElementById("map-panel-title")) return;
    const drawing = createDrawingMap("leaflet-map");
    if (!drawing) return;

    const locationButton = document.getElementById("map-location-button");
    const zoomInButton = document.getElementById("map-zoom-in-button");
    const zoomOutButton = document.getElementById("map-zoom-out-button");
    const collectButton = document.getElementById("collect-field-button");
    const drawButton = document.getElementById("draw-tool-button");
    const editButton = document.getElementById("edit-tool-button");
    const deleteButton = document.getElementById("delete-tool-button");

    drawing.syncPanel();
    drawing.setDrawingEnabled(false);
    setButtonActive(drawButton, false);
    setButtonActive(editButton, true);

    if (locationButton && locationButton.dataset.bound !== "true") {
      locationButton.dataset.bound = "true";
      locationButton.addEventListener("click", function () {
        drawing.focusSampleSpot();
        toast("Jumped to a sample area");
      });
    }

    if (zoomInButton && zoomInButton.dataset.bound !== "true") {
      zoomInButton.dataset.bound = "true";
      zoomInButton.addEventListener("click", function () {
        drawing.map.setZoom(drawing.map.getZoom() + 0.5);
      });
    }

    if (zoomOutButton && zoomOutButton.dataset.bound !== "true") {
      zoomOutButton.dataset.bound = "true";
      zoomOutButton.addEventListener("click", function () {
        drawing.map.setZoom(drawing.map.getZoom() - 0.5);
      });
    }

    if (collectButton && collectButton.dataset.bound !== "true") {
      collectButton.dataset.bound = "true";
      collectButton.addEventListener("click", function () {
        drawing.collectArea();
      });
    }

    if (deleteButton && deleteButton.dataset.bound !== "true") {
      deleteButton.dataset.bound = "true";
      deleteButton.addEventListener("click", function () {
        drawing.clearDraft();
        toast("Cleared the draft boundary");
      });
    }

    if (drawButton && drawButton.dataset.bound !== "true") {
      drawButton.dataset.bound = "true";
      drawButton.addEventListener("click", async function () {
        const farmer = await ensureSignedInProfile();
        if (!farmer || !drawing.setDrawingEnabled(true)) return;
        setButtonActive(drawButton, true);
        setButtonActive(editButton, false);
        toast(`Drawing as ${farmer.farmerName || farmer.farmerId}`);
      });
    }

    if (editButton && editButton.dataset.bound !== "true") {
      editButton.dataset.bound = "true";
      editButton.addEventListener("click", function () {
        drawing.setDrawingEnabled(false);
        setButtonActive(drawButton, false);
        setButtonActive(editButton, true);
        toast("Pan mode enabled");
      });
    }
  }

  function conflictPage() {
    if (!document.getElementById("conflict-title")) return;
    createLeafletMap("conflict-leaflet-map", true);
    setText("conflict-title", "Area Review");
    setText("conflict-headline", "Declared farmer area and mapped polygon area do not fully match.");
    setText("conflict-copy", `${data.meta.farmerCount} farmers declare ${data.meta.totalFarmerAreaHa.toFixed(2)} ha, while the imported polygon sheet totals ${data.meta.totalPolygonAreaHa.toFixed(2)} ha.`);
    setText("conflict-current-area", `${data.meta.totalFarmerAreaHa.toFixed(2)} ha declared`);
    setText("conflict-severity", `${data.meta.areaGapHa.toFixed(2)} ha gap (${((data.meta.areaGapHa / data.meta.totalFarmerAreaHa) * 100).toFixed(2)}%)`);
  }

  bindRoutes();
  bindProfileCreation();
  summaryPage();
  logbookPage();
  mapPage();
  conflictPage();
})();
