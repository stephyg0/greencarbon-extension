const { supabase, supabaseReady, supabaseConfigError } = require("../supabase-client");

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(JSON.stringify(payload));
}

function getLogbookData(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }

    if (typeof req.body === "string") {
      try {
        resolve(JSON.parse(req.body));
      } catch (error) {
        reject(error);
      }
      return;
    }

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

function requireSupabase(res) {
  if (supabaseReady) return true;
  sendJson(res, 500, {
    ok: false,
    error: supabaseConfigError,
  });
  return false;
}

function methodNotAllowed(res, methods) {
  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { ok: false, error: "Method not allowed" });
}

module.exports = {
  getLogbookData,
  methodNotAllowed,
  readJsonBody,
  requireSupabase,
  sendJson,
  supabase,
};
