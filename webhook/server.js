import express from "express";
import crypto from "node:crypto";
import fetch from "node-fetch";

const VERIFY_TOKEN = process.env.FB_VERIFY_TOKEN || "dev-verify-token";
const APP_SECRET   = process.env.FB_APP_SECRET || "";
const GH_OWNER     = process.env.GH_OWNER;   // e.g. 'xcountry1582'
const GH_REPO      = process.env.GH_REPO;    // e.g. 'Recipe-Book'
const GH_PAT       = process.env.GH_PAT;
const ENQUEUE_WF   = process.env.ENQUEUE_WORKFLOW || "enqueue-video.yml";
const REF_BRANCH   = process.env.ENQUEUE_REF || "main";

const app = express();
app.use(express.json({ verify: (req, res, buf) => (req.rawBody = buf) }));

function verifySignature(req) {
  if (!APP_SECRET) return true;
  const sig = req.get("X-Hub-Signature-256") || "";
  const hmac = crypto.createHmac("sha256", APP_SECRET);
  hmac.update(req.rawBody);
  const expected = "sha256=" + hmac.digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

app.get("/webhook", (req, res) => {
  const { ["hub.mode"]: mode, ["hub.verify_token"]: token, ["hub.challenge"]: challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    if (!verifySignature(req)) return res.sendStatus(403);
    for (const entry of req.body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        const senderId = ev.sender?.id;
        const msg = ev.message;
        for (const att of msg?.attachments ?? []) {
          if (att.type === "video" && att.payload?.url) {
            const ts = ev.timestamp || Date.now();
            const niceName = `messenger_${senderId || "unknown"}_${ts}.mp4`;
            await dispatch({ video_url: att.payload.url, filename: niceName });
          }
        }
      }
    }
  } catch (e) {
    console.error("webhook error:", e);
  }
  res.sendStatus(200);
});

async function dispatch(inputs) {
  if (!GH_OWNER || !GH_REPO || !GH_PAT) {
    console.error("Missing GH_OWNER/GH_REPO/GH_PAT");
    return;
  }
  const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${encodeURIComponent(ENQUEUE_WF)}/dispatches`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_PAT}`,
      Accept: "application/vnd.github+json",
    },
    body: JSON.stringify({ ref: REF_BRANCH, inputs }),
  });
  if (!resp.ok) console.error("Dispatch failed", resp.status, await resp.text());
  else console.log("Dispatch OK");
}

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Webhook listening on", port));
