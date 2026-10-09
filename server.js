import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeMarketNewsWithGemini, analyzeIndividualStory, getCachedBrainOverview } from './geminiBrain.js';
import { updateNiftyCrudeData } from './niftyCrudeEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// In-memory cache for ultra-fast 10-second polling
let cachedNews = [];
let cachedStocks = [];
let lastFetchTime = 0;
const CACHE_TTL_MS = 6000;

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/xml, text/html, */*'
};

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      ...options,
      headers: { ...HEADERS, ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}

function stripHtml(html) {
  if (!html) return '';
  return html.replace(/<!\[CDATA\[/gi, '')
             .replace(/\]\]>/gi, '')
             .replace(/<[^>]*>?/gm, ' ')
             .replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'")
             .replace(/\s+/g, ' ')
             .trim();
}

function parseRss(xmlText, sourceName, fallbackImage) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
    const linkMatch = block.match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/i);
    const descMatch = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    
    let imageUrl = fallbackImage;
    const mediaMatch = block.match(/<media:content[^>]*url="([^"]+)"/i) || block.match(/<enclosure[^>]*url="([^"]+)"/i);
    if (mediaMatch) imageUrl = mediaMatch[1];

    const title = titleMatch ? stripHtml(titleMatch[1]) : '';
    if (!title || title.length < 5) continue;

    const link = linkMatch ? linkMatch[1].trim() : '';
    const desc = descMatch ? stripHtml(descMatch[1]) : '';
    let pubTime = Date.now();
    if (pubDateMatch) {
      const parsed = Date.parse(pubDateMatch[1]);
      if (!isNaN(parsed)) pubTime = parsed;
    }

    // Extract potential Indian NSE stock symbols
    const tickerMatches = title.match(/\b([A-Z]{3,10})\b/g) || [];
    const commonWords = new Set(['THE', 'FOR', 'AND', 'WITH', 'NEW', 'ALL', 'OUT', 'HOW', 'WHY', 'CAN', 'MAY', 'NOW', 'TOP', 'BIG', 'BUY', 'SELL', 'HAS', 'HAD', 'ITS', 'ARE', 'WAS', 'SEE', 'SAYS', 'WAR', 'OIL', 'FED', 'RATE', 'STOCKS', 'STOCK', 'INDIA', 'INDIAN', 'MARKET', 'MARKETS', 'SHARE', 'SHARES', 'NIFTY', 'SENSEX', 'RUPEE', 'CRORE', 'LAKH', 'TODAY']);
    const foundTickers = [...new Set(tickerMatches.filter(t => !commonWords.has(t)))].slice(0, 3).map(sym => ({
      symbol: sym,
      name: sym
    }));

    items.push({
      id: `${sourceName.toLowerCase()}-${Buffer.from(title.substring(0, 30)).toString('base64').replace(/[^a-zA-Z0-9]/g, '')}`,
      source: sourceName,
      title,
      summary: desc.length > 220 ? desc.substring(0, 217) + '...' : desc,
      content: desc,
      url: link,
      imageUrl: imageUrl,
      timestamp: pubTime,
      tickers: foundTickers.length > 0 ? foundTickers : [{ symbol: 'NIFTY', name: 'Nifty 50 Index' }],
      category: 'NSE Market News'
    });
  }
  return items;
}

// 1. Fetch StockEdge Live Feeds (App 4 - 100% Indian NSE/BSE)
async function fetchStockEdge() {
  const newsList = [];
  try {
    const [latest, topNews, recent] = await Promise.allSettled([
      fetchJson('https://api.stockedge.com/Api/DailyDashboardApi/GetLatestNewsItems'),
      fetchJson('https://api.stockedge.com/Api/MarketHomeDashboardApi/GetTopNewsItems'),
      fetchJson('https://api.stockedge.com/Api/WidgetsApi/GetTopRecentLatestNews')
    ]);

    const combined = [
      ...(latest.status === 'fulfilled' && Array.isArray(latest.value) ? latest.value : []),
      ...(topNews.status === 'fulfilled' && Array.isArray(topNews.value) ? topNews.value : []),
      ...(recent.status === 'fulfilled' && Array.isArray(recent.value) ? recent.value : [])
    ];

    for (const item of combined) {
      const securities = (item.NewsitemSecurities || []).map(sec => ({
        symbol: sec.Symbol || '',
        name: sec.SecurityName || '',
        price: sec.C || null,
        changePercent: sec.CZG !== undefined ? sec.CZG : null,
        logoUrl: sec.SecurityLogoUrl || null
      }));

      const cleanSummary = stripHtml(item.Caption || item.Description || '');
      const cleanContent = item.Details || item.Description || '';
      const dt = item.Date ? new Date(item.Date).getTime() : Date.now();

      newsList.push({
        id: `stockedge-${item.ID || Math.random()}`,
        source: 'StockEdge (NSE)',
        title: item.Description || item.Caption || 'NSE Market Action',
        summary: cleanSummary,
        content: cleanContent,
        url: `https://web.stockedge.com/news/${item.ID || ''}`,
        imageUrl: securities[0]?.logoUrl || (item.NewsitemIndustries && item.NewsitemIndustries[0]?.IndustryImageUrl) || 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80',
        timestamp: dt,
        tickers: securities.length > 0 ? securities : [{ symbol: 'NIFTY', name: 'NSE Market' }],
        category: item.SubSectionName || 'NSE Corporate News',
        badge: 'NSE Verified'
      });
    }
  } catch (err) {
    console.error('StockEdge NSE Fetch Error:', err.message);
  }
  return newsList;
}

// 2. Fetch Yahoo Finance India (NSE Equities from App 2)
async function fetchYahooFinanceIndia() {
  const newsList = [];
  try {
    const tickers = ['%5ENSEI', '%5EBSESN', 'RELIANCE.NS', 'TCS.NS', 'HDFCBANK.NS', 'INFY.NS', 'TATAMOTORS.NS', 'SBIN.NS', 'ICICIBANK.NS', 'ITC.NS', 'BHARTIARTL.NS'];
    const url = `https://finance.mobile.yahoo.com/dp/v2/newsfeed?region=IN&lang=en-IN&category=${tickers.join('%2C')}&types=story`;
    const data = await fetchJson(url);
    const items = data?.items?.result || [];

    for (const item of items) {
      if (item.type !== 'story') continue;

      let imageUrl = 'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=800&auto=format&fit=crop&q=80';
      const resolutions = item.main_image?.resolutions || [];
      if (resolutions.length > 0) {
        const best = resolutions.find(r => r.tag === 'fit-width-640' || r.tag === 'original') || resolutions[0];
        if (best?.url) imageUrl = best.url;
      }

      const entities = item.entities || [];
      const tickersFound = [];
      for (const ent of entities) {
        if (ent.term && ent.term.startsWith('TICKER:')) {
          let sym = ent.term.replace('TICKER:', '').replace('.NS', '').replace('.BO', '');
          tickersFound.push({ symbol: sym, name: sym });
        }
      }

      const pubTime = (item.published_at || 0) * 1000 || Date.now();

      newsList.push({
        id: `yahoo-${item.uuid || item.id || Buffer.from(item.title || '').toString('base64').substring(0, 16)}`,
        source: 'Yahoo Finance India',
        publisher: item.publisher || 'Yahoo India Finance',
        title: item.title || '',
        summary: item.summary || item.title || '',
        content: item.summary || item.title || '',
        url: item.link || '',
        imageUrl: imageUrl,
        timestamp: pubTime,
        tickers: tickersFound.length > 0 ? tickersFound : [{ symbol: 'NIFTY', name: 'Nifty 50' }],
        category: 'NSE Equities'
      });
    }
  } catch (err) {
    console.error('Yahoo Finance India Fetch Error:', err.message);
  }
  return newsList;
}

// 3. Fetch Economic Times Indian Stock Market RSS
async function fetchEconomicTimes() {
  const newsList = [];
  try {
    const xml = await fetchText('https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms');
    const items = parseRss(xml, 'Economic Times (NSE)', 'https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=800&auto=format&fit=crop&q=80');
    newsList.push(...items);
  } catch (err) {
    console.error('Economic Times Fetch Error:', err.message);
  }
  return newsList;
}

// 4. Fetch Moneycontrol Indian Market Reports RSS
async function fetchMoneycontrol() {
  const newsList = [];
  try {
    const xml = await fetchText('https://www.moneycontrol.com/rss/marketreports.xml');
    const items = parseRss(xml, 'Moneycontrol (NSE)', 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&auto=format&fit=crop&q=80');
    newsList.push(...items);
  } catch (err) {
    console.error('Moneycontrol Fetch Error:', err.message);
  }
  return newsList;
}

// 5. Fetch Real-Time Live NSE Quotes & Top Moving Stocks
const NSE_WATCHLIST = [
  { symbol: 'NIFTY 50', yahoo: '^NSEI', name: 'Nifty 50 Index', defaultPrice: 22545.50 },
  { symbol: 'BANK NIFTY', yahoo: '^NSEBANK', name: 'Nifty Bank Index', defaultPrice: 55335.00 },
  { symbol: 'RELIANCE', yahoo: 'RELIANCE.NS', name: 'Reliance Industries', defaultPrice: 1170.70 },
  { symbol: 'TCS', yahoo: 'TCS.NS', name: 'Tata Consultancy Services', defaultPrice: 2165.90 },
  { symbol: 'HDFCBANK', yahoo: 'HDFCBANK.NS', name: 'HDFC Bank Ltd.', defaultPrice: 708.30 },
  { symbol: 'INFY', yahoo: 'INFY.NS', name: 'Infosys Ltd.', defaultPrice: 1021.05 },
  { symbol: 'ICICIBANK', yahoo: 'ICICIBANK.NS', name: 'ICICI Bank Ltd.', defaultPrice: 1245.00 },
  { symbol: 'TATAMOTORS', yahoo: 'TATAMOTORS.NS', name: 'Tata Motors Ltd.', defaultPrice: 925.30 },
  { symbol: 'BHARTIARTL', yahoo: 'BHARTIARTL.NS', name: 'Bharti Airtel Ltd.', defaultPrice: 1680.00 },
  { symbol: 'SBIN', yahoo: 'SBIN.NS', name: 'State Bank of India', defaultPrice: 795.50 },
  { symbol: 'ITC', yahoo: 'ITC.NS', name: 'ITC Limited', defaultPrice: 478.20 }
];

async function fetchYahooQuote(item) {
  try {
    const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.yahoo)}?interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (meta && meta.regularMarketPrice) {
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose || meta.previousClose || price;
      const chg = Number((price - prev).toFixed(2));
      const pct = Number(((chg / prev) * 100).toFixed(2));
      return {
        symbol: item.symbol,
        name: item.name,
        price: Number(price.toFixed(2)),
        change: chg,
        changePercent: pct,
        source: 'NSE Live'
      };
    }
  } catch (err) {
    // Ignore fallback
  }
  return {
    symbol: item.symbol,
    name: item.name,
    price: item.defaultPrice,
    change: 0.00,
    changePercent: 0.00,
    source: 'NSE Estimated'
  };
}

async function fetchNseStocks() {
  const stocks = [];

  // 1. Fetch live quotes for core watchlist
  const liveWatchlistPromises = NSE_WATCHLIST.map(item => fetchYahooQuote(item));
  const watchlistResults = await Promise.allSettled(liveWatchlistPromises);
  for (const r of watchlistResults) {
    if (r.status === 'fulfilled' && r.value) {
      stocks.push(r.value);
    }
  }

  // 2. Fetch top moving stocks from StockEdge
  try {
    const data = await fetchJson('https://api.stockedge.com/Api/DailyDashboardApi/GetTopStocksInNews');
    if (Array.isArray(data)) {
      for (const s of data) {
        const sym = s.SecuritySlug ? s.SecuritySlug.toUpperCase().replace(/-/g, '') : `SEC-${s.SecurityID}`;
        // avoid duplicate if already in watchlist
        if (!stocks.some(existing => existing.symbol === sym)) {
          stocks.push({
            symbol: sym,
            name: s.SecurityName || 'NSE Stock',
            price: s.C ? Number(s.C.toFixed(2)) : null,
            change: s.CZ ? Number(s.CZ.toFixed(2)) : 0,
            changePercent: s.CZG ? Number(s.CZG.toFixed(2)) : 0,
            source: 'StockEdge Live'
          });
        }
      }
    }
  } catch (err) {
    console.error('Top Stocks Fetch Error:', err.message);
  }

  return stocks;
}

// Master Aggregator for Strictly NSE Market
async function getAllStockNews(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedNews.length > 0 && (now - lastFetchTime) < CACHE_TTL_MS) {
    return { news: cachedNews, stocks: cachedStocks, cached: true, timestamp: lastFetchTime };
  }

  console.log(`[${new Date().toLocaleTimeString()}] Fetching fresh NSE Indian stock news across providers...`);

  const [stockEdgeRes, yahooRes, etRes, mcRes, stocksRes] = await Promise.allSettled([
    fetchStockEdge(),
    fetchYahooFinanceIndia(),
    fetchEconomicTimes(),
    fetchMoneycontrol(),
    fetchNseStocks()
  ]);

  const allItems = [
    ...(stockEdgeRes.status === 'fulfilled' ? stockEdgeRes.value : []),
    ...(yahooRes.status === 'fulfilled' ? yahooRes.value : []),
    ...(etRes.status === 'fulfilled' ? etRes.value : []),
    ...(mcRes.status === 'fulfilled' ? mcRes.value : [])
  ];

  // Deduplicate
  const seenTitles = new Set();
  const deduped = [];
  for (const item of allItems) {
    const normTitle = (item.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 35);
    if (!normTitle || seenTitles.has(normTitle)) continue;
    seenTitles.add(normTitle);
    deduped.push(item);
  }

  // Sort newest first
  deduped.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  cachedNews = deduped;
  cachedStocks = stocksRes.status === 'fulfilled' ? stocksRes.value : cachedStocks;
  lastFetchTime = now;

  console.log(`[${new Date().toLocaleTimeString()}] Aggregated ${cachedNews.length} NSE Indian stock news items.`);

  // Trigger Gemini AI Brain in background
  analyzeMarketNewsWithGemini(cachedNews).catch(err => {
    console.error('Background Gemini NSE Brain error:', err.message);
  });

  return { news: cachedNews, stocks: cachedStocks, cached: false, timestamp: lastFetchTime };
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: GET /api/news
  if (pathname === '/api/news') {
    try {
      const force = urlObj.searchParams.get('refresh') === 'true';
      const result = await getAllStockNews(force);
      const brainOverview = getCachedBrainOverview();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'success',
        serverTime: Date.now(),
        market: 'NSE (National Stock Exchange of India)',
        count: result.news.length,
        data: result.news,
        stocks: result.stocks,
        aiBrain: brainOverview
      }));
    } catch (err) {
      console.error('API Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
    return;
  }

  // API: GET /api/ai/brain
  if (pathname === '/api/ai/brain') {
    try {
      const force = urlObj.searchParams.get('force') === 'true';
      let brainOverview = force ? null : getCachedBrainOverview();
      if (!brainOverview && cachedNews.length > 0) {
        brainOverview = await analyzeMarketNewsWithGemini(cachedNews);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'success',
        market: 'NSE',
        brain: brainOverview || getCachedBrainOverview()
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
    return;
  }

  // API: POST /api/ai/analyze-story
  if (pathname === '/api/ai/analyze-story' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const storyId = payload.storyId;
        const story = cachedNews.find(s => s.id === storyId) || payload.story;
        if (!story) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Story not found' }));
          return;
        }
        const analysis = await analyzeIndividualStory(story);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ status: 'success', analysis }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // API: GET /api/stocks
  if (pathname === '/api/stocks') {
    try {
      const force = urlObj.searchParams.get('refresh') === 'true';
      if (force || cachedStocks.length === 0) {
        cachedStocks = await fetchNseStocks();
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        status: 'success',
        market: 'NSE',
        timestamp: Date.now(),
        stocks: cachedStocks
      }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
    return;
  }

  // API: GET /api/chart/nifty-crude (Dual-Line Nifty & Crude Oil Engine)
  if (pathname === '/api/chart/nifty-crude') {
    try {
      const data = await updateNiftyCrudeData();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', message: err.message }));
    }
    return;
  }

  // Static File Serving
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

getAllStockNews(true).catch(console.error);

server.listen(PORT, () => {
  console.log(`
=============================================================
  FINPULSE NSE LIVE STOCK TERMINAL RUNNING
  URL: http://localhost:${PORT}
  Exclusively: National Stock Exchange (NSE) / Indian Equities
  Gemini Live Market Brain: ACTIVE (Model: gemini-3.8-flash)
  Auto-refresh interval: 10 Seconds
=============================================================
  `);
});
