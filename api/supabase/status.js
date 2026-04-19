const { requireSupabase, sendJson, supabase } = require("../_utils");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  if (!requireSupabase(res)) return;

  const [profilesResult, polygonsResult] = await Promise.all([
    supabase.from("farmer_profiles").select("id", { count: "exact" }).limit(1),
    supabase.from("field_polygons").select("id", { count: "exact" }).limit(1),
  ]);

  if (profilesResult.error || polygonsResult.error) {
    sendJson(res, 500, {
      ok: false,
      profilesError: profilesResult.error?.message || null,
      polygonsError: polygonsResult.error?.message || null,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    profilesCount: profilesResult.count || 0,
    polygonsCount: polygonsResult.count || 0,
  });
};
