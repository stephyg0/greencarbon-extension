const {
  getLogbookData,
  methodNotAllowed,
  readJsonBody,
  requireSupabase,
  sendJson,
  supabase,
} = require("../_utils");

async function getPolygons(res) {
  const result = await supabase.from("field_polygons").select("*").order("created_at", { ascending: true });
  if (result.error) {
    sendJson(res, 500, { ok: false, error: result.error.message });
    return;
  }

  sendJson(res, 200, { ok: true, polygons: result.data || [] });
}

async function createPolygon(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const farmerId = String(body.farmerId || "").trim();
  const farmerName = String(body.farmerName || "").trim();
  const fieldGroup = String(body.fieldGroup || "").trim();
  const payload = {
    farmer_id: farmerId,
    farmer_name: farmerName,
    field_group: fieldGroup,
    area_ha: Number(body.areaHa || 0),
    latlngs: Array.isArray(body.latlngs) ? body.latlngs : [],
    logbook_data: getLogbookData(body.logbookData),
  };

  if (!farmerId || !farmerName || !fieldGroup || !payload.latlngs.length) {
    sendJson(res, 400, { ok: false, error: "Missing farmer or polygon data" });
    return;
  }

  const profileResult = await supabase
    .from("farmer_profiles")
    .upsert(
      {
        farmer_id: farmerId,
        name: farmerName,
        field_group: fieldGroup,
        logbook_data: getLogbookData(body.logbookData),
      },
      { onConflict: "farmer_id" }
    );

  if (profileResult.error) {
    sendJson(res, 500, { ok: false, error: profileResult.error.message });
    return;
  }

  const result = await supabase.from("field_polygons").insert(payload).select("*").single();
  if (result.error) {
    sendJson(res, 500, { ok: false, error: result.error.message });
    return;
  }

  sendJson(res, 200, { ok: true, polygon: result.data });
}

module.exports = async function handler(req, res) {
  if (!requireSupabase(res)) return;

  if (req.method === "GET") {
    await getPolygons(res);
    return;
  }

  if (req.method === "POST") {
    await createPolygon(req, res);
    return;
  }

  methodNotAllowed(res, ["GET", "POST"]);
};
