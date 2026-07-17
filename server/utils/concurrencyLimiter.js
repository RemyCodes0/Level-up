// Tiny concurrency limiter — caps how many async jobs run at once, queueing
// the rest instead of firing everything immediately. Originally lived only
// inside claudeService.js (for GLM request concurrency); pulled out here so
// exportController.js's video-render queue can reuse the exact same,
// already-proven implementation instead of a second copy.
//
// IMPORTANT: the limited function must cover the ENTIRE lifetime of the
// work, not just the part up to some early promise resolution — releasing
// the slot too early defeats the whole point of limiting concurrency.
function createLimiter(maxConcurrent) {
  let active = 0;
  const queue = [];

  const next = () => {
    if (active >= maxConcurrent || queue.length === 0) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
  };
}

module.exports = { createLimiter };
