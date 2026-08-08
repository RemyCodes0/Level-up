// controllers/libraryComponentController.js
//
// Admin-only CRUD + review surface for the global reusable-component
// library (see services/globalComponentLibrary.js for the generation-time
// mechanism this manages). A candidate proposed by real lesson generation
// sits here, invisible to every other lesson, until an admin approves it
// on the Component Library admin page.
const LibraryComponent = require("../models/LibraryComponent");
const { buildPreviewCode, PREVIEW_DURATION_FRAMES } = require("../services/globalComponentLibrary");

// GET /api/admin/library-components?status=candidate|active|rejected&page=&limit=
exports.listLibraryComponents = async (req, res) => {
  try {
    const status = ["candidate", "active", "rejected"].includes(req.query.status) ? req.query.status : "candidate";
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const [components, total] = await Promise.all([
      LibraryComponent.find({ status })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LibraryComponent.countDocuments({ status }),
    ]);

    res.json({ components, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error("listLibraryComponents error:", err);
    res.status(500).json({ error: "Failed to load component library" });
  }
};

// GET /api/admin/library-components/stats
// Answers "is the library actually being leaned on, or is nearly
// everything still novel?" — a reuse rate computed from data that's
// already being recorded (usageCount, sourceCourseId), with NO new writes
// anywhere: totalReuses is every lesson-call to an already-existing
// component (usageCount is incremented once per lesson that calls one —
// see trackUsage in globalComponentLibrary.js); totalProposed is every
// DISTINCT component ever born from real generation (sourceCourseId set —
// excludes the hand-written pre-seed, which has sourceCourseId: null),
// regardless of whether it ended up active/candidate/rejected, since each
// one represents one moment the system needed something new. The ratio of
// the two is "growth events" vs "reuse events" — a rising rate over time
// means the library is increasingly covering what lessons actually need
// instead of lessons increasingly inventing their own.
exports.getLibraryStats = async (req, res) => {
  try {
    const [usageAgg, totalProposed] = await Promise.all([
      LibraryComponent.aggregate([{ $group: { _id: null, total: { $sum: "$usageCount" } } }]),
      LibraryComponent.countDocuments({ sourceCourseId: { $ne: null } }),
    ]);
    const totalReuses = usageAgg[0]?.total || 0;
    const denom = totalReuses + totalProposed;
    const reuseRatePercent = denom > 0 ? Math.round((totalReuses / denom) * 100) : null;
    res.json({ totalReuses, totalProposed, reuseRatePercent });
  } catch (err) {
    console.error("getLibraryStats error:", err);
    res.status(500).json({ error: "Failed to load library stats" });
  }
};

// GET /api/admin/library-components/:id/preview
// Returns a complete synthesized "lesson code" string — same shape
// DynamicPlayer already knows how to compile and play — so the admin page
// can render this ONE component's real animated output using the exact
// same player every real lesson uses, with zero new frontend rendering code.
exports.getLibraryComponentPreview = async (req, res) => {
  try {
    const component = await LibraryComponent.findById(req.params.id).lean();
    if (!component) return res.status(404).json({ error: "Component not found" });

    const code = buildPreviewCode(component);
    res.json({ code, durationInFrames: PREVIEW_DURATION_FRAMES });
  } catch (err) {
    console.error("getLibraryComponentPreview error:", err);
    res.status(500).json({ error: "Failed to build preview" });
  }
};

// POST /api/admin/library-components/:id/approve
exports.approveLibraryComponent = async (req, res) => {
  try {
    const component = await LibraryComponent.findByIdAndUpdate(
      req.params.id,
      { status: "active" },
      { new: true }
    );
    if (!component) return res.status(404).json({ error: "Component not found" });
    res.json({ component });
  } catch (err) {
    console.error("approveLibraryComponent error:", err);
    res.status(500).json({ error: "Failed to approve component" });
  }
};

// POST /api/admin/library-components/:id/reject
exports.rejectLibraryComponent = async (req, res) => {
  try {
    const component = await LibraryComponent.findByIdAndUpdate(
      req.params.id,
      { status: "rejected" },
      { new: true }
    );
    if (!component) return res.status(404).json({ error: "Component not found" });
    res.json({ component });
  } catch (err) {
    console.error("rejectLibraryComponent error:", err);
    res.status(500).json({ error: "Failed to reject component" });
  }
};

// DELETE /api/admin/library-components/:id — permanent removal, for
// cleaning up a rejected/mistaken entry entirely rather than leaving it
// sitting in the rejected list forever.
exports.deleteLibraryComponent = async (req, res) => {
  try {
    const deleted = await LibraryComponent.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Component not found" });
    res.json({ ok: true });
  } catch (err) {
    console.error("deleteLibraryComponent error:", err);
    res.status(500).json({ error: "Failed to delete component" });
  }
};
