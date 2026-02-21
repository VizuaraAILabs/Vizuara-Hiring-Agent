const config = require('./config');
const { chunkArray, retryAsync, filterAboveThreshold } = require('./utils');

/**
 * Simulates fetching a batch of records from an external source.
 * Returns an array of { id, value } objects.
 */
async function fetchBatch(batchIndex, size) {
  // Simulate network call
  return Array.from({ length: size }, (_, i) => ({
    id: batchIndex * size + i + 1,
    value: Math.floor(Math.random() * 200),
  }));
}

/**
 * Processes a single batch: fetches, filters above threshold, and returns results.
 */
async function processBatch(batchIndex, size) {
  const records = await retryAsync(
    () => fetchBatch(batchIndex, size),
    config.MAX_RETRIES,
    config.RETRY_DELAY_MS
  );
  return filterAboveThreshold(records, config.THRESHOLD);
}

/**
 * Runs the full pipeline over all data.
 *
 * @param {number[]} dataIds - Array of IDs to process
 * @returns {Promise<object[]>} Filtered results
 */
async function runPipeline(dataIds) {
  const chunks = chunkArray(dataIds, config.BATCH_SIZE);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const processed = await processBatch(i, chunks[i].length);
    results.push(processed);   // BUG 4: should be results.push(...processed) to flatten
  }

  // BUG 5: Filters r !== null, but r is an array (because of BUG 4), so this is ineffective
  return results.filter((r) => r !== null);
}

module.exports = { runPipeline, processBatch, fetchBatch };
