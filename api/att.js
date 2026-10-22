// Shared attendance store — Vercel serverless function + Upstash Redis (REST).
// Env vars (added automatically when you connect Upstash Redis in Vercel → Storage):
//   KV_REST_API_URL / KV_REST_API_TOKEN   (or UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)
// Optional: ATT_PIN — if set, marking/resetting needs this PIN.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "vit23oct:att";

async function redis(cmd) {
  const r = await fetch(URL_, { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function all() {
  const arr = (await redis(["HGETALL", KEY])) || [];
  const out = {};
  for (let i = 0; i < arr.length; i += 2) { try { out[arr[i]] = JSON.parse(arr[i + 1]); } catch {} }
  return out;
}
const clean = (v) => {
  if (!v || typeof v !== "object") return null;
  const o = {};
  for (const k of ["g", "h"]) if (typeof v[k] === "string" && v[k].length <= 20) o[k] = v[k];
  return o.g || o.h ? o : null;
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(500).json({ error: "Database not connected. In Vercel: Storage → Upstash Redis → Connect to project, then redeploy." });
  try {
    if (req.method === "GET") return res.json({ att: await all() });
    const pin = process.env.ATT_PIN;
    if (pin && req.headers["x-pin"] !== pin) return res.status(401).json({ error: "pin" });
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const id = String(body.id || "");
      if (!/^\d{10}$/.test(id)) return res.status(400).json({ error: "bad id" });
      const v = clean(body.v);
      if (v) await redis(["HSET", KEY, id, JSON.stringify(v)]); else await redis(["HDEL", KEY, id]);
      return res.json({ att: await all() });
    }
    if (req.method === "DELETE") { await redis(["DEL", KEY]); return res.json({ att: {} }); }
    res.status(405).end();
  } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
}
