const http = require("http");
const fs = require("fs");
const path = require("path");
const { supabase, supabaseReady, supabaseConfigError } = require("./supabase-client");

const preferredPort = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "127.0.0.1";
let currentPort = preferredPort;
const root = __dirname;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".zip": "application/zip",
};

const pageRoutes = {
  "/": "stitch_agri_logbook_field_mapper/dashboard_summary/code.html",
  "/index.html": "stitch_agri_logbook_field_mapper/dashboard_summary/code.html",
  "/summary": "stitch_agri_logbook_field_mapper/dashboard_summary/code.html",
  "/summary.html": "stitch_agri_logbook_field_mapper/dashboard_summary/code.html",
  "/logbook": "stitch_agri_logbook_field_mapper/logbook_spreadsheet_view/code.html",
  "/logbook.html": "stitch_agri_logbook_field_mapper/logbook_spreadsheet_view/code.html",
  "/map": "stitch_agri_logbook_field_mapper/map_drawing_tools/code.html",
  "/map.html": "stitch_agri_logbook_field_mapper/map_drawing_tools/code.html",
  "/conflict": "stitch_agri_logbook_field_mapper/map_conflict_state/code.html",
  "/conflict.html": "stitch_agri_logbook_field_mapper/map_conflict_state/code.html",
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      res.end(error.code === "ENOENT" ? "Not found" : "Internal server error");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-cache",
  });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function getLogbookData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function handleApi(req, res, urlPath) {
  if (!supabaseReady) {
    sendJson(res, 500, {
      ok: false,
      error: supabaseConfigError,
    });
    return true;
  }

  if (urlPath === "/api/supabase/status" && req.method === "GET") {
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
      return true;
    }

    sendJson(res, 200, {
      ok: true,
      profilesCount: profilesResult.count || 0,
      polygonsCount: polygonsResult.count || 0,
    });
    return true;
  }

  if (urlPath === "/api/farmer-profiles" && req.method === "GET") {
    const result = await supabase.from("farmer_profiles").select("*").order("created_at", { ascending: true });
    if (result.error) {
      sendJson(res, 500, { ok: false, error: result.error.message });
      return true;
    }
    sendJson(res, 200, { ok: true, profiles: result.data || [] });
    return true;
  }

  if (urlPath === "/api/farmer-profiles/sync" && req.method === "POST") {
    const body = await readJsonBody(req);
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
      return true;
    }

    const result = await supabase
      .from("farmer_profiles")
      .upsert(cleaned, { onConflict: "farmer_id" })
      .select("*");

    if (result.error) {
      sendJson(res, 500, { ok: false, error: result.error.message });
      return true;
    }

    sendJson(res, 200, { ok: true, profiles: result.data || [] });
    return true;
  }

  if (urlPath === "/api/field-polygons" && req.method === "GET") {
    const result = await supabase.from("field_polygons").select("*").order("created_at", { ascending: true });
    if (result.error) {
      sendJson(res, 500, { ok: false, error: result.error.message });
      return true;
    }
    sendJson(res, 200, { ok: true, polygons: result.data || [] });
    return true;
  }

  if (urlPath === "/api/field-polygons" && req.method === "POST") {
    const body = await readJsonBody(req);
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
      return true;
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
      return true;
    }

    const result = await supabase.from("field_polygons").insert(payload).select("*").single();
    if (result.error) {
      sendJson(res, 500, { ok: false, error: result.error.message });
      return true;
    }

    sendJson(res, 200, { ok: true, polygon: result.data });
    return true;
  }

  if (urlPath.startsWith("/api/")) {
    sendJson(res, 404, { ok: false, error: "Unknown API route" });
    return true;
  }

  return false;
}

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  const routeTarget = pageRoutes[urlPath];

  if (await handleApi(req, res, urlPath)) {
    return;
  }

  if (routeTarget) {
    sendFile(res, path.join(root, routeTarget));
    return;
  }

  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, safePath);

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isDirectory()) {
      sendFile(res, path.join(filePath, "index.html"));
      return;
    }

    if (!error && stats.isFile()) {
      sendFile(res, filePath);
      return;
    }

    sendFile(res, path.join(root, pageRoutes["/"]));
  });
});

function startServer(port) {
  currentPort = port;
  server.listen(port, host, () => {
    console.log(`Field Mapper UI running at http://${host}:${port}`);
  });
}

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    const nextPort = currentPort + 1;
    console.log(`Port ${currentPort} is busy, retrying on http://${host}:${nextPort}`);
    setTimeout(() => startServer(nextPort), 100);
    return;
  }

  throw error;
});

startServer(preferredPort);
