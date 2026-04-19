const {
  getLogbookData,
  methodNotAllowed,
  readJsonBody,
  requireSupabase,
  sendJson,
  supabase,
} = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    methodNotAllowed(res, ["POST"]);
    return;
  }

  if (!requireSupabase(res)) return;

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: "Invalid JSON body" });
    return;
  }

  const profiles = Array.isArray(body.profiles) ? body.profiles : [];
  const cleaned = profiles
    .filter((profile) => profile && profile.farmerId && (profile.name || profile.farmerName) && profile.fieldGroup)
    .map((profile) => ({
      farmer_id: String(profile.farmerId),
      name: String(profile.name || profile.farmerName),
      field_group: String(profile.fieldGroup),
      logbook_data: getLogbookData(profile.logbookData),
    }));

  if (!cleaned.length) {
    sendJson(res, 200, { ok: true, profiles: [] });
    return;
  }

  const result = await supabase.from("farmer_profiles").upsert(cleaned, { onConflict: "farmer_id" }).select("*");
  if (result.error) {
    sendJson(res, 500, { ok: false, error: result.error.message });
    return;
  }

  sendJson(res, 200, { ok: true, profiles: result.data || [] });
};
