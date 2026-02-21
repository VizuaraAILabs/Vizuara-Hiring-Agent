const { runPipeline, processBatch } = require('../src/pipeline');
const { chunkArray, retryAsync, filterAboveThreshold } = require('../src/utils');
const config = require('../src/config');

describe('Pipeline', () => {
  describe('chunkArray', () => {
    test('splits array into correct number of chunks', () => {
      const arr = [1, 2, 3, 4, 5];
      const chunks = chunkArray(arr, 2);
      // Should be [[1,2], [3,4], [5]] — 3 chunks
      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual([1, 2]);
      expect(chunks[1]).toEqual([3, 4]);
      expect(chunks[2]).toEqual([5]);
    });

    test('does not produce empty trailing chunks', () => {
      const arr = [1, 2, 3, 4];
      const chunks = chunkArray(arr, 2);
      chunks.forEach((chunk) => {
        expect(chunk.length).toBeGreaterThan(0);
      });
    });
  });

  describe('retryAsync', () => {
    test('returns result on first success', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      const result = await retryAsync(fn, 3, 10);
      expect(result).toBe('ok');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('throws after all retries are exhausted', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('fail'));
      await expect(retryAsync(fn, 3, 10)).rejects.toThrow('fail');
    });
  });

  describe('filterAboveThreshold', () => {
    test('filters items correctly with numeric threshold', () => {
      const items = [
        { id: 1, value: 50 },
        { id: 2, value: 150 },
        { id: 3, value: 100 },
        { id: 4, value: 200 },
      ];
      const result = filterAboveThreshold(items, config.THRESHOLD);
      // Should only include items with value > 100
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.id)).toEqual([2, 4]);
    });
  });

  describe('runPipeline', () => {
    test('returns a flat array of results', async () => {
      const ids = Array.from({ length: 120 }, (_, i) => i + 1);
      const results = await runPipeline(ids);

      // Results should be a flat array of objects, not nested arrays
      expect(Array.isArray(results)).toBe(true);
      results.forEach((item) => {
        expect(item).toHaveProperty('id');
        expect(item).toHaveProperty('value');
        expect(typeof item.value).toBe('number');
      });
    });

    test('all returned values exceed threshold', async () => {
      const ids = Array.from({ length: 80 }, (_, i) => i + 1);
      const results = await runPipeline(ids);

      results.forEach((item) => {
        expect(item.value).toBeGreaterThan(100);
      });
    });
  });
});
