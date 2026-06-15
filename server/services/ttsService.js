const OpenAI = require("openai");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { v4: uuidv4 } = require("uuid");
const { parseBuffer } = require("music-metadata");

const REGION = "eu-north-1";
const BUCKET_NAME = "remotionlambda-eunorth1-i6kf1mjsva"; // existing Lambda bucket
const FPS = 30;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 120000, // 2 min — TTS can be slow
  maxRetries: 3,
});

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Generates one audio clip from text, uploads it to S3, and measures its
// exact duration so the animation can be built to match.
async function generateSceneAudio(text) {
  // 1. Generate speech
  const response = await openai.audio.speech.create({
    model: "tts-1",
    voice: "nova",
    input: text,
    speed: 1.0,
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  // 2. Measure the exact duration of the audio
  const metadata = await parseBuffer(buffer, "audio/mpeg");
  const durationSeconds = metadata.format.duration; // e.g. 7.34
  const durationInFrames = Math.ceil(durationSeconds * FPS);

  // 3. Upload to S3
  const key = `voiceovers/${uuidv4()}.mp3`;
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "audio/mpeg",
    })
  );

  const audioUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${key}`;

  return {
    audioUrl,
    durationSeconds,
    durationInFrames,
  };
}

// Generates audio for every scene in a plan, returning each scene enriched
// with its audioUrl + measured frame duration.
async function generateAllSceneAudio(scenes) {
  const enriched = [];

  for (const scene of scenes) {
    console.log(`  [tts] Scene ${scene.id}: generating audio...`);
    const { audioUrl, durationSeconds, durationInFrames } =
      await generateSceneAudio(scene.narration);

    enriched.push({
      ...scene,
      audioUrl,
      durationSeconds,
      durationInFrames,
    });

    console.log(
      `  [tts] Scene ${scene.id}: ${durationSeconds.toFixed(1)}s = ${durationInFrames} frames`
    );
  }

  const totalFrames = enriched.reduce((sum, s) => sum + s.durationInFrames, 0);
  console.log(`  [tts] Total duration: ${totalFrames} frames (${(totalFrames / FPS).toFixed(1)}s)`);

  return { scenes: enriched, totalFrames };
}

module.exports = { generateSceneAudio, generateAllSceneAudio, FPS };