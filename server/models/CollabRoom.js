const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Wraps a normal Course (built via the same generation pipeline every solo
// course uses) with room-level metadata: who's in it, how to join it, and
// when the group is "done enough" to trigger a remedial lesson. Kept
// separate from Course itself so the (far more common) solo-course path
// stays untouched, and so the shared player/quiz/generation code that
// already knows how to render a Course needs zero changes to also serve a
// collaborative one.
const collabRoomSchema = new mongoose.Schema(
  {
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    visibility: { type: String, enum: ["public", "invite-only"], default: "invite-only" },
    // Short, human-typeable code (8 uppercase hex chars) — the "invite code"
    // join path. Same lazy-generate-once pattern as Course.shareToken /
    // User.referralCode elsewhere in this codebase.
    inviteCode: { type: String, unique: true, index: true },
    // Long, unguessable token — the "join via link" path, same generation
    // pattern (crypto.randomBytes(12).toString("hex")) as Course.shareToken.
    shareToken: { type: String, unique: true, index: true },
    // % of participants required to submit a quiz attempt before the group
    // is considered "done enough" to trigger the remedial lesson.
    completionThreshold: { type: Number, min: 1, max: 100, default: 100 },
    participants: [participantSchema],
    // Guards against generating the remedial lesson more than once for the
    // same room — flipped atomically via findOneAndUpdate (see
    // remedialService.js), not read-then-write, so two members finishing at
    // the same instant can't both trigger generation.
    remedialTriggered: { type: Boolean, default: false },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CollabRoom", collabRoomSchema);
