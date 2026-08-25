// services/bufferService.js
//
// Thin client for Buffer's GraphQL API — replaces ayrshareService.js
// (switched because Buffer has a genuine free tier: $0/mo, up to 3
// channels, 1 API key, 3,000 requests/month — this automation uses maybe
// a dozen requests a day, nowhere close). Verified against Buffer's own
// docs before writing this (endpoint, auth, mutation/query shapes) — not
// guessed.
//
// Two things happen OUTSIDE this code, that you have to do yourself:
//   1. BUFFER_API_KEY set in .env — Buffer dashboard → Settings → API →
//      Create a new API key. Plain personal access token, no OAuth app
//      registration needed for this (that's only required if you were
//      building an app for OTHER people to authorize).
//   2. Your TikTok account connected as a channel in Buffer — dashboard →
//      Channels → connect TikTok. Same one-time, dashboard-only,
//      human-in-the-loop step every one of these aggregators requires
//      (TikTok's own OAuth consent screen has no API path around a human
//      clicking "allow").

const BUFFER_API_KEY = process.env.BUFFER_API_KEY;
const BUFFER_API_URL = "https://api.buffer.com";

if (!BUFFER_API_KEY) {
  console.warn("[boot] BUFFER_API_KEY is not set — automated TikTok posting will fail with an auth error.");
}

async function graphql(query, variables = {}) {
  if (!BUFFER_API_KEY) {
    throw new Error("Buffer is not configured (BUFFER_API_KEY missing)");
  }
  const response = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BUFFER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  const data = await response.json();
  if (!response.ok || data.errors) {
    throw new Error(`Buffer API error: ${data.errors ? JSON.stringify(data.errors) : response.statusText}`);
  }
  return data.data;
}

// organizationId isn't something you configure — it's read from your own
// account on every call. Not cached: this automation makes on the order of
// a dozen Buffer requests a day, nowhere near the free tier's 3,000/month
// cap, so the simplicity of "always ask" beats the risk of a stale cache
// after you reconnect a channel or Buffer changes something account-side.
async function getOrganizationId() {
  const data = await graphql(`query { account { organizations { id name } } }`);
  const org = data?.account?.organizations?.[0];
  if (!org) throw new Error("No Buffer organization found on this account.");
  return org.id;
}

async function getTikTokChannelId() {
  const organizationId = await getOrganizationId();
  const data = await graphql(
    // FIX (real error, hit live): Buffer's schema types this as the custom
    // scalar "OrganizationId!", not the generic "String!" the docs example
    // implied — GraphQL enforces the declared variable type strictly, so
    // the mismatched signature failed validation before the query ever ran.
    `query GetChannels($organizationId: OrganizationId!) {
      channels(input: { organizationId: $organizationId }) {
        id
        name
        service
      }
    }`,
    { organizationId }
  );
  const channel = (data?.channels || []).find((c) => c.service === "tiktok");
  if (!channel) {
    throw new Error(
      "No TikTok channel connected in Buffer — connect one at buffer.com (Channels → TikTok) before this can post."
    );
  }
  return channel.id;
}

// `videoUrl` MUST be a publicly reachable URL — same requirement Ayrshare
// had, confirmed in Buffer's own docs too ("the asset url must point to a
// publicly accessible file"). automationService.js hosts the rendered MP4
// under /uploads before calling this.
async function postVideoToTikTok(caption, videoUrl) {
  const channelId = await getTikTokChannelId();

  const data = await graphql(
    `mutation CreatePost($input: CreatePostInput!) {
      createPost(input: $input) {
        ... on PostActionSuccess {
          post { id externalLink }
        }
        ... on MutationError {
          message
        }
      }
    }`,
    {
      input: {
        text: caption,
        channelId,
        schedulingType: "automatic",
        mode: "shareNow", // post immediately, not queued/scheduled
        assets: [{ video: { url: videoUrl } }],
      },
    }
  );

  const result = data?.createPost;
  if (result?.message) {
    // MutationError branch — Buffer's GraphQL layer returns this as a
    // normal response, not an HTTP error, so it isn't caught by graphql()'s
    // own error handling above.
    throw new Error(`Buffer rejected the post: ${result.message}`);
  }
  if (!result?.post?.id) {
    throw new Error("Buffer returned no post id and no error — unexpected response shape.");
  }

  // externalLink (the actual TikTok URL) may not be populated immediately
  // if TikTok is still processing the upload on their end — same kind of
  // async gap Ayrshare's "pending" status represented. Returned as-is,
  // possibly null; automationService.js stores whatever comes back rather
  // than assuming it's always there.
  return { bufferPostId: result.post.id, platform: "tiktok", postUrl: result.post.externalLink || null };
}

module.exports = { postVideoToTikTok };
