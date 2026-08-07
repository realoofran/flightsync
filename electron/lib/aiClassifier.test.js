import { describe, it, expect, vi } from 'vitest';
import { needsAiClassification, classifyAddonsWithAI } from './aiClassifier.js';

function addon(overrides) {
  return {
    id: 'a1',
    folderName: 'unknown-addon',
    title: 'Unknown Addon',
    categoryPath: '',
    contentType: 'OTHER',
    candidateIcaos: [],
    matchedIcao: null,
    matchedAircraftType: null,
    matchedAirline: null,
    ...overrides,
  };
}

function toolResponse(results) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      content: [{ type: 'tool_use', name: 'submit_classifications', input: { results } }],
    }),
  };
}

describe('needsAiClassification', () => {
  it('flags OTHER addons', () => {
    expect(needsAiClassification(addon({ contentType: 'OTHER' }))).toBe(true);
  });

  it('flags SCENERY missing an ICAO match', () => {
    expect(needsAiClassification(addon({ contentType: 'SCENERY', matchedIcao: null }))).toBe(true);
    expect(needsAiClassification(addon({ contentType: 'SCENERY', matchedIcao: 'EDDM' }))).toBe(false);
  });

  it('flags AIRCRAFT/LIVERY missing an aircraft type match', () => {
    expect(needsAiClassification(addon({ contentType: 'LIVERY', matchedAircraftType: null }))).toBe(true);
    expect(needsAiClassification(addon({ contentType: 'AIRCRAFT', matchedAircraftType: 'A21N' }))).toBe(false);
  });
});

describe('classifyAddonsWithAI', () => {
  it('skips the network call entirely when nothing needs classification', async () => {
    const fetchImpl = vi.fn();
    const result = await classifyAddonsWithAI([addon({ contentType: 'SCENERY', matchedIcao: 'EDDM' })], 'key', { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result).toEqual({ updates: [], classifiedCount: 0, failedCount: 0, errorMessage: null });
  });

  it('maps a well-formed response onto validated updates', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(toolResponse([
      { id: 'a1', contentType: 'SCENERY', matchedIcao: 'eddm', matchedAircraftType: '', matchedAirline: '', confidence: 'high' },
    ]));
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.updates).toEqual([
      { id: 'a1', contentType: 'SCENERY', matchedIcao: 'EDDM', matchedAircraftType: null, matchedAirline: null, confidence: 'high' },
    ]);
    expect(result.classifiedCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('drops items with an invalid contentType instead of failing the whole batch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(toolResponse([
      { id: 'a1', contentType: 'NOT_A_REAL_TYPE', confidence: 'high' },
      { id: 'a2', contentType: 'AIRCRAFT', matchedAircraftType: 'B738', confidence: 'medium' },
    ]));
    const result = await classifyAddonsWithAI(
      [addon({ id: 'a1' }), addon({ id: 'a2', contentType: 'AIRCRAFT' })],
      'key',
      { fetchImpl },
    );
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].id).toBe('a2');
    expect(result.failedCount).toBe(1);
  });

  it('drops items whose id was not in the submitted batch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(toolResponse([
      { id: 'not-in-batch', contentType: 'SCENERY', matchedIcao: 'EDDM', confidence: 'high' },
    ]));
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.updates).toEqual([]);
  });

  it('falls back to low confidence when the model omits or invents a confidence value', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(toolResponse([
      { id: 'a1', contentType: 'OTHER', confidence: 'extremely-sure' },
    ]));
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.updates[0].confidence).toBe('low');
  });

  it('never throws on a network failure — reports it via errorMessage instead', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('DNS lookup failed'));
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.updates).toEqual([]);
    expect(result.failedCount).toBe(1);
    expect(result.errorMessage).toContain('DNS lookup failed');
  });

  it('never throws on a non-2xx response — reports it via errorMessage instead', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.errorMessage).toMatch(/key/i);
  });

  it('never throws on a malformed API response missing tool_use content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ content: [] }) });
    const result = await classifyAddonsWithAI([addon({ id: 'a1' })], 'key', { fetchImpl });
    expect(result.updates).toEqual([]);
    expect(result.errorMessage).toBeTruthy();
  });

  it('still returns successful updates even when one batch partially fails', async () => {
    const addons = Array.from({ length: 30 }, (_, i) => addon({ id: `a${i}` }));
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(toolResponse(addons.slice(0, 25).map(a => ({ id: a.id, contentType: 'OTHER', confidence: 'low' }))))
      .mockRejectedValueOnce(new Error('timeout'));
    const result = await classifyAddonsWithAI(addons, 'key', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.updates).toHaveLength(25);
    expect(result.failedCount).toBe(5);
    expect(result.errorMessage).toBeNull(); // partial success shouldn't read as a hard error
  });
});
