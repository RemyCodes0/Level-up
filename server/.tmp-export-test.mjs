import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const API = "http://localhost:5000";
const COURSE_ID = "6a30a70fb5911f3389376196";

function auth(userId) {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "30m" });
  return { headers: { Authorization: `Bearer ${token}` } };
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const Course = (await import("./models/Course.js")).default;
  const course = await Course.findById(COURSE_ID).select("userId").lean();
  const a = auth(course.userId);

  console.log("=== TEST 1: de-duplication — fire the SAME export twice rapidly ===");
  const [r1, r2] = await Promise.all([
    axios.post(`${API}/api/export/${COURSE_ID}/1?format=landscape`, {}, a),
    axios.post(`${API}/api/export/${COURSE_ID}/1?format=landscape`, {}, a),
  ]);
  console.log("jobId 1:", r1.data.jobId, "| jobId 2:", r2.data.jobId, "| SAME:", r1.data.jobId === r2.data.jobId);

  console.log("\n=== TEST 2: concurrency queueing — start a DIFFERENT export while the first is in flight ===");
  const r3 = await axios.post(`${API}/api/export/${COURSE_ID}/2?format=vertical`, {}, a);
  console.log("Second distinct jobId:", r3.data.jobId);

  // Poll both jobs' status a few times, log status/progress over time to confirm job2 stays "queued" while job1 renders
  const jobId1 = r1.data.jobId;
  const jobId2 = r3.data.jobId;
  for (let i = 0; i < 6; i++) {
    await new Promise((res) => setTimeout(res, 3000));
    const [s1, s2] = await Promise.all([
      axios.get(`${API}/api/export/${jobId1}/status`, a),
      axios.get(`${API}/api/export/${jobId2}/status`, a),
    ]);
    console.log(`[t=${(i + 1) * 3}s] job1(landscape L1): ${s1.data.status} ${s1.data.progress}% | job2(vertical L2): ${s2.data.status} ${s2.data.progress}%`);
  }

  console.log("\n=== TEST 3: invalid format ===");
  try {
    await axios.post(`${API}/api/export/${COURSE_ID}/1?format=bogus`, {}, a);
    console.log("FAIL: should have rejected invalid format");
  } catch (e) {
    console.log("Correctly rejected:", e.response?.status, e.response?.data?.message);
  }

  console.log("\n=== TEST 4: download a non-existent job ===");
  try {
    await axios.get(`${API}/api/export/deadbeefdeadbeef/download`, a);
    console.log("FAIL: should 404");
  } catch (e) {
    console.log("Correctly 404s:", e.response?.status, e.response?.data?.message);
  }

  console.log("\n=== Waiting for job1 to finish (landscape, lesson 1) — this drives the real render pipeline ===");
  let job1Final = null;
  for (let i = 0; i < 60; i++) {
    const s = await axios.get(`${API}/api/export/${jobId1}/status`, a);
    if (s.data.status === "ready" || s.data.status === "failed") { job1Final = s.data; break; }
    if (i % 5 === 0) console.log(`  [poll ${i}] job1: ${s.data.status} ${s.data.progress}%`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("job1 final:", JSON.stringify(job1Final));

  if (job1Final?.status === "ready") {
    console.log("\n=== TEST 5: actually download the finished file ===");
    const dl = await axios.get(`${API}/api/export/${jobId1}/download`, { ...a, responseType: "arraybuffer" });
    console.log("Download HTTP", dl.status, "| bytes:", dl.data.byteLength, "| content-type:", dl.headers["content-type"]);
  }

  console.log("\nWaiting for job2 (vertical, lesson 2) to finish too, to confirm it eventually renders after job1...");
  let job2Final = null;
  for (let i = 0; i < 60; i++) {
    const s = await axios.get(`${API}/api/export/${jobId2}/status`, a);
    if (s.data.status === "ready" || s.data.status === "failed") { job2Final = s.data; break; }
    if (i % 5 === 0) console.log(`  [poll ${i}] job2: ${s.data.status} ${s.data.progress}%`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  console.log("job2 final:", JSON.stringify(job2Final));

  process.exit(0);
}

main().catch((e) => { console.error("TEST FAILED:", e.response?.data || e.message, e.stack); process.exit(1); });
