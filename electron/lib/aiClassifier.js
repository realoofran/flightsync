// electron/lib/aiClassifier.js
//
// Fallback classification for addons the fast, offline heuristics in
// addonScanner.js couldn't confidently resolve — anything that landed as
// OTHER, or as SCENERY/AIRCRAFT/LIVERY without its key identifying field
// (matchedIcao / matchedAircraftType). This is deliberately a SEPARATE,
// explicitly user-triggered step (a "Classify with AI" button), not part of
// the scan pipeline itself: scanning stays instant and offline, and nobody
// gets a surprise network call or API bill just from rescanning.
//
// Uses the user's OWN Anthropic API key, entered in Settings and stored
// locally only — never bundled into the shipped app, which would be
// trivially extractable from the packaged asar.
//
// Every response is treated as untrusted input: results are matched back to
// the exact addon ids we sent, contentType is checked against the same
// CONTENT_TYPES enum the rest of the app uses, and malformed/missing fields
// are dropped per-item rather than failing the whole batch. Network,
// timeout, and parse failures are all caught — this module never throws for
// an individual addon it couldn't classify; classifyAddonsWithAI only
// throws for the one precondition it can't work around (no API key).

import { CONTENT_TYPES } from './contentTypes.js';

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const FETCH_TIMEOUT_MS = 30000;
const BATCH_SIZE = 25; // addons per API call — bounds prompt size and keeps one bad batch from losing everything else
const CONFIDENCE_LEVELS = ['high', 'medium', 'low'];

/**
 * An addon needs AI help if the heuristic scan left it with nothing to go
 * on: OTHER (no content type could be guessed at all), or a recognized type
 * missing the one field that actually identifies it.
 */
export function needsAiClassification(addon) {
  if (!addon) return false;
  if (addon.contentType === 'OTHER') return true;
  if (addon.contentType === 'SCENERY') return !addon.matchedIcao;
  if (addon.contentType === 'AIRCRAFT' || addon.contentType === 'LIVERY') return !addon.matchedAircraftType;
  return false;
}

/**
 * @param {Array} addons        the full current library (only the ones
 *                               needsAiClassification() flags are sent)
 * @param {string} apiKey       user's Anthropic API key
 * @param {{fetchImpl?: Function}} [opts]  fetchImpl override for tests
 * @returns {Promise<{updates: Array, classifiedCount: number, failedCount: number, errorMessage: string|null}>}
 */
export async function classifyAddonsWithAI(addons, apiKey, { fetchImpl = fetch } = {}) {
  const targets = (addons ?? []).filter(needsAiClassification);
  if (targets.length === 0) {
    return { updates: [], classifiedCount: 0, failedCount: 0, errorMessage: null };
  }

  const batches = chunk(targets, BATCH_SIZE);
  const updates = [];
  let failedCount = 0;
  let firstError = null;

  for (const batch of batches) {
    try {
      const results = await classifyBatch(batch, apiKey, fetchImpl);
      updates.push(...results);
      failedCount += batch.length - results.length;
    } catch (err) {
      failedCount += batch.length;
      firstError = firstError ?? err.message;
    }
  }

  return {
    updates,
    classifiedCount: updates.length,
    failedCount,
    // Only surface an error when NOTHING came back — a partial failure
    // still returns useful updates and shouldn't read as a hard error.
    errorMessage: updates.length === 0 ? firstError : null,
  };
}

async function classifyBatch(batch, apiKey, fetchImpl) {
  const batchIds = new Set(batch.map(a => a.id));
  const payload = batch.map(a => ({
    id: a.id,
    folderName: a.folderName,
    title: a.title,
    categoryPath: a.categoryPath || null,
    candidateIcaos: a.candidateIcaos ?? [],
  }));

  const tool = {
    name: 'submit_classifications',
    description: 'Submit a content-type classification and identifying details for each MSFS addon.',
    input_schema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'must exactly match the id given in the input' },
              contentType: { type: 'string', enum: CONTENT_TYPES },
              matchedIcao: { type: 'string', description: '4-letter ICAO airport code if contentType is SCENERY and identifiable, else empty string' },
              matchedAircraftType: { type: 'string', description: 'ICAO aircraft type designator (e.g. A21N, B738) if contentType is AIRCRAFT or LIVERY and identifiable, else empty string' },
              matchedAirline: { type: 'string', description: '3-letter ICAO airline code if contentType is LIVERY and identifiable, else empty string' },
              confidence: { type: 'string', enum: CONFIDENCE_LEVELS },
            },
            required: ['id', 'contentType', 'confidence'],
          },
        },
      },
      required: ['results'],
    },
  };

  const prompt = `You are classifying Microsoft Flight Simulator 2024 community addons by folder/title metadata alone (no file contents available).

Content types:
- SCENERY: an airport or landmark scenery package
- LIVERY: a repaint/livery for one specific aircraft+airline
- AIRCRAFT: a full aircraft add-on (not a livery)
- OTHER: anything else (utility, sound pack, traffic, tool, etc.) — use this whenever you're not confident it's one of the other three

For each addon below, call submit_classifications with your best answer. Only fill matchedIcao/matchedAircraftType/matchedAirline when you're actually confident in a real, specific ICAO code — leave the field as an empty string rather than guessing. Set confidence to "high" only when the name unambiguously identifies the addon; use "low" for anything you're genuinely unsure about.

Addons:
${JSON.stringify(payload, null, 2)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let res;
  try {
    res = await fetchImpl(CLAUDE_API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 4096,
        tools: [tool],
        tool_choice: { type: 'tool', name: 'submit_classifications' },
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`AI classification didn't respond within ${FETCH_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Couldn't reach the Anthropic API: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Anthropic API rejected the key — check it in Settings.');
    }
    throw new Error(`Anthropic API returned ${res.status}.`);
  }

  const data = await res.json();
  const toolUse = (data?.content ?? []).find(block => block.type === 'tool_use' && block.name === 'submit_classifications');
  const rawResults = toolUse?.input?.results;
  if (!Array.isArray(rawResults)) {
    throw new Error('AI response did not include the expected classification data.');
  }

  const validated = [];
  for (const raw of rawResults) {
    const item = validateItem(raw, batchIds);
    if (item) validated.push(item);
  }
  return validated;
}

function validateItem(raw, batchIds) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || !batchIds.has(raw.id)) return null;
  if (!CONTENT_TYPES.includes(raw.contentType)) return null;

  const confidence = CONFIDENCE_LEVELS.includes(raw.confidence) ? raw.confidence : 'low';

  return {
    id: raw.id,
    contentType: raw.contentType,
    matchedIcao: normalizeCode(raw.matchedIcao, 4, 4),
    matchedAircraftType: normalizeCode(raw.matchedAircraftType, 2, 4),
    matchedAirline: normalizeCode(raw.matchedAirline, 2, 4),
    confidence,
  };
}

function normalizeCode(value, minLen, maxLen) {
  if (typeof value !== 'string') return null;
  const upper = value.trim().toUpperCase();
  if (upper.length < minLen || upper.length > maxLen) return null;
  if (!/^[A-Z0-9]+$/.test(upper)) return null;
  return upper;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
