// Pipeline configuration
module.exports = {
  BATCH_SIZE: 50,
  THRESHOLD: "100",     // BUG 1: Should be 100 (number), string breaks numeric comparisons
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 100,
  OUTPUT_FORMAT: 'json',
};
