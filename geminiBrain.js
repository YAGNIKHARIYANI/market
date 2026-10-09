import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load local .env if present
try {
  if (typeof process.loadEnvFile === 'function') {
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
      process.loadEnvFile(envPath);
    }
  }
} catch (e) {
  // Silent fallback
}

function getLoadedApiKeys() {
  const envVal = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
  if (envVal) {
    return envVal.split(',').map(k => k.trim()).filter(Boolean);
  }
  return [];
}

let currentKeyIndex = 0;
const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite'];

let cachedBrainOverview = null;
let lastBrainAnalysisTime = 0;
let isBrainAnalyzing = false;
const storyAnalysisCache = new Map();

function getNextApiKey() {
  const keys = getLoadedApiKeys();
  if (keys.length === 0) return null;
  const key = keys[currentKeyIndex % keys.length];
  currentKeyIndex = (currentKeyIndex + 1) % keys.length;
  return key;
}

export async function callGemini(prompt, responseMimeType = 'application/json') {
  let lastError = null;
  const loadedKeys = getLoadedApiKeys();
  if (loadedKeys.length === 0) {
    return null;
  }

  for (const model of MODELS) {
    for (let attempts = 0; attempts < loadedKeys.length; attempts++) {
      const key = getNextApiKey();
      if (!key) continue;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

      const payload = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: responseMimeType
        }
      };

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Gemini ${model} HTTP ${res.status}: ${errText.substring(0, 150)}`);
        }

        const data = await res.json();
        const output = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!output) throw new Error('Empty Gemini output');

        return {
          modelUsed: model,
          text: output
        };
      } catch (err) {
        lastError = err;
        console.warn(`[Gemini NSE Brain] Model ${model} failed with key ${key.substring(0, 8)}... (${err.message}). Trying next...`);
      }
    }
  }

  throw lastError || new Error('All Gemini API attempts exhausted');
}

// Global NSE Market Brain Overview
export async function analyzeMarketNewsWithGemini(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return cachedBrainOverview;
  }

  const now = Date.now();
  if (isBrainAnalyzing || (cachedBrainOverview && (now - lastBrainAnalysisTime) < 30000)) {
    return cachedBrainOverview;
  }

  isBrainAnalyzing = true;
  console.log(`[Gemini NSE Brain] Synthesizing live NSE market impact with latest model across ${articles.length} Indian stories...`);

  const topArticles = articles.slice(0, 12).map((a, i) => {
    const tickers = (a.tickers || []).map(t => t.symbol).filter(Boolean).join(', ');
    return `[NSE Story ${i + 1}] Source: ${a.source} | NSE Symbols: ${tickers || 'General Market'} | Title: ${a.title} | Details: ${(a.summary || '').substring(0, 180)}`;
  }).join('\n');

  const prompt = `You are the Dalal Street / National Stock Exchange (NSE) Live Intelligence Brain of FINPULSE Terminal, powered by the latest Gemini AI.
Analyze these real-time Indian stock market news items strictly relating to NSE-listed equities, Nifty 50, Bank Nifty, and Indian corporate developments:

${topArticles}

Task:
1. Provide a sharp, institutional-grade Executive Overview of current NSE market dynamics (Nifty sentiment, sector rotations, corporate actions).
2. Determine which specific NSE-listed shares will take the MOST SIGNIFICANT MOVEMENTS (rallies, drops, or volatility surges) based strictly on these news events.
3. For each affected NSE share, predict movement direction (BULLISH, BEARISH, or VOLATILE), estimated percentage/INR magnitude impact, impact level (HIGH, MEDIUM), and the exact catalyst reason.
4. Calculate an overall NSE market sentiment score (0 to 100, where >50 is Bullish for Nifty/NSE, <50 is Bearish).

Respond strictly with valid JSON adhering to this exact schema:
{
  "executiveOverview": "Concise 2-3 sentence executive briefing on NSE / Dalal Street pulse.",
  "marketSentimentScore": 65,
  "marketSentimentLabel": "BULLISH BIAS",
  "mostAffectedShares": [
    {
      "symbol": "NSE_SYMBOL",
      "name": "Company Name",
      "sentiment": "BULLISH" | "BEARISH" | "VOLATILE",
      "movementPrediction": "+2% to +5% rally" or "-1.5% to -3% decline" or "Intraday breakout",
      "impactLevel": "HIGH" | "MEDIUM",
      "catalyst": "Specific Indian market or company trigger reason explaining why this share moves most",
      "sourceReference": "Source provider"
    }
  ],
  "topSectorsMoving": [
    {
      "sector": "Indian Sector Name (e.g. Nifty IT, Banking, Capital Goods, Auto)",
      "trend": "Bullish" | "Bearish" | "Mixed",
      "driver": "Brief driver"
    }
  ],
  "keyTakeawayForTraders": "Actionable single-sentence strategy takeaway for NSE intraday/F&O traders."
}`;

  try {
    const { modelUsed, text } = await callGemini(prompt);
    const parsed = JSON.parse(text);
    parsed.model = modelUsed;
    parsed.timestamp = now;

    cachedBrainOverview = parsed;
    lastBrainAnalysisTime = now;
    console.log(`[Gemini NSE Brain] Analysis completed successfully using ${modelUsed}! Identified ${parsed.mostAffectedShares?.length || 0} moving NSE shares.`);
    return cachedBrainOverview;
  } catch (err) {
    console.error('[Gemini NSE Brain] Analysis failed:', err.message);
    if (cachedBrainOverview) return cachedBrainOverview;
    return {
      executiveOverview: "NSE market feeds monitored across StockEdge and Indian financial sources. Synthesizing next cycle.",
      marketSentimentScore: 50,
      marketSentimentLabel: "NEUTRAL",
      mostAffectedShares: [],
      topSectorsMoving: [],
      keyTakeawayForTraders: "Track Nifty 50 support levels and individual stock order-book momentum.",
      model: "gemini-3.8-flash",
      timestamp: now
    };
  } finally {
    isBrainAnalyzing = false;
  }
}

// Single story deep-dive for NSE
export async function analyzeIndividualStory(story) {
  if (!story || !story.id) return null;

  if (storyAnalysisCache.has(story.id)) {
    return storyAnalysisCache.get(story.id);
  }

  const prompt = `You are the Gemini Live NSE Market Brain. Analyze this individual Indian stock news event:
Headline: ${story.title}
Source: ${story.source}
Content: ${story.content || story.summary}
Associated NSE Tickers: ${(story.tickers || []).map(t => t.symbol).join(', ')}

Provide a structured impact evaluation for NSE traders:
1. Which specific NSE share(s) will move most because of this news?
2. Expected price reaction (BULLISH, BEARISH, VOLATILE) and expected percentage move.
3. Ripple effect on Indian peer stocks or related sectoral index.
4. Executive summary of why this matters for the Indian market.

Respond strictly in JSON:
{
  "quickTake": "One sentence summary of NSE impact.",
  "primaryStock": {
    "symbol": "NSE_SYMBOL",
    "name": "Name",
    "sentiment": "BULLISH" | "BEARISH" | "VOLATILE",
    "expectedMove": "+X% to +Y% surge",
    "reasoning": "Detailed catalyst explanation."
  },
  "rippleEffects": [
    {
      "symbol": "PEER_NSE_SYMBOL",
      "effect": "Positive / Negative / Neutral",
      "reason": "Why peer is affected"
    }
  ],
  "riskRating": "LOW" | "MEDIUM" | "HIGH"
}`;

  try {
    const { modelUsed, text } = await callGemini(prompt);
    const parsed = JSON.parse(text);
    parsed.model = modelUsed;
    storyAnalysisCache.set(story.id, parsed);
    return parsed;
  } catch (err) {
    console.error('[Gemini NSE Brain] Story analysis error:', err.message);
    return {
      quickTake: story.summary || story.title,
      primaryStock: {
        symbol: (story.tickers && story.tickers[0]?.symbol) || 'NIFTY',
        name: (story.tickers && story.tickers[0]?.name) || 'NSE Equities',
        sentiment: 'NEUTRAL',
        expectedMove: 'Moderate variance',
        reasoning: 'News reported on Indian stock exchange feed.'
      },
      rippleEffects: [],
      riskRating: 'MEDIUM',
      model: 'gemini-3.8-flash'
    };
  }
}

export function getCachedBrainOverview() {
  return cachedBrainOverview;
}
