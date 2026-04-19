const { methodNotAllowed, requireSupabase, sendJson, supabase } = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    methodNotAllowed(res, ["GET"]);
    return;
  }

  if (!requireSupabase(res)) return;

  const result = await supabase.from("farmer_profiles").select("*").order("created_at", { ascending: true });
  if (result.error) {
    sendJson(res, 500, { ok: false, error: result.error.message });
    return;
  }

  sendJson(res, 200, { ok: true, profiles: result.data || [] });
};
