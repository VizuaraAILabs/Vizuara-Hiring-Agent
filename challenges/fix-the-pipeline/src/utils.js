/**
 * Splits an array into chunks of the given size.
 */
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i <= arr.length; i += size) {   // BUG 2: should be i < arr.length
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retries an async function up to `retries` times.
 */
async function retryAsync(fn, retries, delayMs) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === retries) {   // BUG 3: should be retries - 1; this never matches so it never throws
        throw lastError;
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  // Silently returns undefined instead of throwing after all retries fail
}

/**
 * Filters out values below a numeric threshold.
 */
function filterAboveThreshold(items, threshold) {
  return items.filter((item) => item.value > threshold);
}

module.exports = { chunkArray, retryAsync, filterAboveThreshold };
