const path = require("path");
const fs = require("fs");
const Ad = require("../models/Ad");
const { generateAdPlan } = require("../services/adService");
const { generateAllSceneAudio } = require("../services/ttsService");
const { generateAdCode } = require("../services/claudeService");

const SERVER_BASE_URL =
  process.env.SERVER_BASE_URL || process.env.APP_URL || "http://localhost:5000";

// Where uploaded brand assets live (mirrors the /audio disk pattern).
const uploadsDir =
  process.env.NODE_ENV === "production"
    ? "/data/uploads"
    : path.resolve(__dirname, "../../remotion-render/public/uploads");

// The uploads dir only needs creating once per process, not once per
// upload — mkdir is cheap but still a blocking syscall on the sync path,
// and there's no reason to pay it (or even the async version of it) on
// every single request once it's known to exist.
let uploadsDirReady = null;
function ensureUploadsDir() {
  if (!uploadsDirReady) {
    uploadsDirReady = fs.promises.mkdir(uploadsDir, { recursive: true });
  }
  return uploadsDirReady;
}

function extFor(mimetype) {
  if (mimetype === "image/png") return "png";
  if (mimetype === "image/jpeg") return "jpg";
  if (mimetype === "image/webp") return "webp";
  if (mimetype === "image/svg+xml") return "svg";
  return "png";
}

// Persist a multer in-memory file to the uploads dir, return its public URL.
async function saveImage(file, adId, label) {
  await ensureUploadsDir();
  const filename = `${adId}-${label}-${Date.now()}.${extFor(file.mimetype)}`;
  await fs.promises.writeFile(path.join(uploadsDir, filename), file.buffer);
  return `${SERVER_BASE_URL}/uploads/${filename}`;
}

// ── The pipeline: plan → voiceover → animation code ──────────────────────────
async function processAd(adId) {
  const ad = await Ad.findById(adId);
  if (!ad) return;
  try {
    // 1) Script
    ad.status = "planning";
    await ad.save();
    const planned = await generateAdPlan(ad, { userId: ad.userId, adId });
    console.log(`[ad ${adId}] planned ${planned.length} scenes`);

    // 2) Voiceover — TTS reads scene.narration / scene.id
    ad.status = "generating";
    await ad.save();
    const forTts = planned.map((s, i) => ({ id: i + 1, narration: s.script }));
    const { scenes: measured, totalFrames } = await generateAllSceneAudio(forTts, null, { userId: ad.userId, adId });

    // Merge measured audio back with the creative fields.
    const scenes = planned.map((s, i) => ({
      role: s.role,
      script: s.script,
      onScreenText: s.onScreenText,
      visualDescription: s.visualDescription,
      audioUrl: measured[i].audioUrl,
      durationInFrames: measured[i].durationInFrames,
    }));

    // 3) Animation code
    const code = await generateAdCode(ad, "AdComposition", scenes, totalFrames, 3, { userId: ad.userId, adId });

    ad.scenes = scenes;
    ad.totalFrames = totalFrames;
    ad.code = code;
    ad.status = "ready";
    ad.error = undefined;
    await ad.save();
    console.log(`[ad ${adId}] ready (${totalFrames} frames)`);
  } catch (err) {
    console.error(`[ad ${adId}] failed:`, err.message);
    await Ad.findByIdAndUpdate(adId, { status: "failed", error: err.message });
  }
}

// POST /api/ads/generate  (multipart: fields + logo + screenshots[])
exports.generateAdHandler = async (req, res) => {
  try {
    const { productName, description, websiteUrl, brandColor, cta, durationTarget } = req.body;
    if (!productName?.trim() || !description?.trim()) {
      return res.status(400).json({ error: "Product name and description are required." });
    }

    const ad = await Ad.create({
      userId: req.user._id,
      productName: productName.trim(),
      description: description.trim(),
      websiteUrl: websiteUrl?.trim() || undefined,
      brandColor: brandColor || "#6366f1",
      cta: cta?.trim() || "Get started today",
      durationTarget: Number(durationTarget) === 60 ? 60 : 30,
      status: "queued",
    });

    // Save uploaded brand assets (optional) — all writes happen in parallel
    // rather than serially blocking one after another.
    const files = req.files || {};
    const [logoUrl, screenshotUrls] = await Promise.all([
      files.logo?.[0] ? saveImage(files.logo[0], ad._id, "logo") : Promise.resolve(undefined),
      files.screenshots?.length
        ? Promise.all(files.screenshots.slice(0, 5).map((f, i) => saveImage(f, ad._id, `shot${i}`)))
        : Promise.resolve(undefined),
    ]);
    if (logoUrl) ad.logoUrl = logoUrl;
    if (screenshotUrls) ad.screenshots = screenshotUrls;
    await ad.save();

    res.json({ ok: true, adId: ad._id });

    // Fire-and-forget background processing.
    processAd(ad._id.toString());
  } catch (err) {
    console.error("generateAdHandler error:", err);
    res.status(500).json({ error: "Failed to start ad generation." });
  }
};

// GET /api/ads/status/:adId
exports.getAdStatusHandler = async (req, res) => {
  const ad = await Ad.findOne({ _id: req.params.adId, userId: req.user._id })
    .select("status error totalFrames code scenes productName brandColor cta");
  if (!ad) return res.status(404).json({ error: "Ad not found" });
  res.json(ad);
};

// GET /api/ads/list
exports.listAdsHandler = async (req, res) => {
  const ads = await Ad.find({ userId: req.user._id })
    .select("productName status createdAt totalFrames durationTarget brandColor")
    .sort({ createdAt: -1 })
    .limit(5); // top 5 most recent
  res.json(ads);
};

// GET /api/ads/:adId
exports.getAdHandler = async (req, res) => {
  const ad = await Ad.findOne({ _id: req.params.adId, userId: req.user._id });
  if (!ad) return res.status(404).json({ error: "Ad not found" });
  res.json(ad);
};

// POST /api/ads/:adId/retry
exports.retryAdHandler = async (req, res) => {
  const ad = await Ad.findOne({ _id: req.params.adId, userId: req.user._id });
  if (!ad) return res.status(404).json({ error: "Ad not found" });
  res.json({ ok: true });
  processAd(ad._id.toString());
};

// DELETE /api/ads/:adId
exports.deleteAdHandler = async (req, res) => {
  await Ad.deleteOne({ _id: req.params.adId, userId: req.user._id });
  res.json({ ok: true });
};