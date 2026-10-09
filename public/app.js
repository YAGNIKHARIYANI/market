// ==========================================================
// FINPULSE STOCK TERMINAL CONTROLLER
// 10-Second Auto-Refresh Multi-Source News Engine
// ==========================================================

const REFRESH_INTERVAL_SEC = 10;
let countdownRemaining = REFRESH_INTERVAL_SEC;
let isAutoRefreshActive = true;
let timerInterval = null;
let isFetching = false;

// Application State
let allNews = [];
let displayedNews = [];
let allStocks = [];
let currentSourceFilter = 'ALL';
let currentSearchTerm = '';
let currentView = 'grid'; // 'grid' | 'list'
let knownArticleIds = new Set();
let pendingNewArticles = [];
let topBreakingStory = null;

// DOM Elements
const newsGrid = document.getElementById('newsGrid');
const countdownSec = document.getElementById('countdownSec');
const countdownCircle = document.getElementById('countdownCircle');
const btnToggleAutoRefresh = document.getElementById('btnToggleAutoRefresh');
const iconPause = document.getElementById('iconPause');
const iconPlay = document.getElementById('iconPlay');
const btnManualRefresh = document.getElementById('btnManualRefresh');
const refreshStatusText = document.getElementById('refreshStatusText');
const tickerTrack = document.getElementById('tickerTrack');
const breakingBanner = document.getElementById('breakingBanner');
const breakingHeadline = document.getElementById('breakingHeadline');
const breakingActionBtn = document.getElementById('breakingActionBtn');
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');
const sourceFilters = document.getElementById('sourceFilters');
const totalCountDisplay = document.getElementById('totalCountDisplay');
const lastUpdatedDisplay = document.getElementById('lastUpdatedDisplay');
const newItemsPill = document.getElementById('newItemsPill');
const newItemsCountText = document.getElementById('newItemsCountText');
const viewGridBtn = document.getElementById('viewGridBtn');
const viewListBtn = document.getElementById('viewListBtn');
const moversList = document.getElementById('moversList');
const countStockEdge = document.getElementById('countStockEdge');
const countYahoo = document.getElementById('countYahoo');
const countBloomberg = document.getElementById('countBloomberg');
const countWSJ = document.getElementById('countWSJ');
const countCNBC = document.getElementById('countCNBC');
const btnReadTopStory = document.getElementById('btnReadTopStory');

// Reader Modal Elements
const readerModal = document.getElementById('readerModal');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const modalSourceBadge = document.getElementById('modalSourceBadge');
const modalTime = document.getElementById('modalTime');
const modalHeadline = document.getElementById('modalHeadline');
const modalTickersBar = document.getElementById('modalTickersBar');
const modalImageContainer = document.getElementById('modalImageContainer');
const modalImage = document.getElementById('modalImage');
const modalBodyText = document.getElementById('modalBodyText');
const modalAudioBtn = document.getElementById('modalAudioBtn');
const modalExternalLink = document.getElementById('modalExternalLink');

// ==========================================================
// 10-SECOND COUNTDOWN & TIMER ENGINE
// ==========================================================
const CIRCLE_CIRCUMFERENCE = 2 * Math.PI * 14; // ~87.96

function updateCountdownCircle(secondsLeft) {
  if (!countdownCircle) return;
  const progressRatio = secondsLeft / REFRESH_INTERVAL_SEC;
  const offset = CIRCLE_CIRCUMFERENCE - (progressRatio * CIRCLE_CIRCUMFERENCE);
  countdownCircle.style.strokeDashoffset = offset;
  countdownSec.textContent = Math.ceil(secondsLeft);
}

function startCountdownEngine() {
  if (timerInterval) clearInterval(timerInterval);
  const TICK_MS = 100;
  
  timerInterval = setInterval(() => {
    if (!isAutoRefreshActive || isFetching) return;

    countdownRemaining -= (TICK_MS / 1000);
    if (countdownRemaining <= 0) {
      countdownRemaining = REFRESH_INTERVAL_SEC;
      updateCountdownCircle(REFRESH_INTERVAL_SEC);
      fetchNews(false); // 10-second periodic background fetch
    } else {
      updateCountdownCircle(countdownRemaining);
    }
  }, TICK_MS);
}

function toggleAutoRefresh() {
  isAutoRefreshActive = !isAutoRefreshActive;
  if (isAutoRefreshActive) {
    iconPause.classList.remove('hidden');
    iconPlay.classList.add('hidden');
    refreshStatusText.textContent = 'LIVE FEED ACTIVE';
    refreshStatusText.style.color = 'var(--text-muted)';
  } else {
    iconPause.classList.add('hidden');
    iconPlay.classList.remove('hidden');
    refreshStatusText.textContent = 'SYNC PAUSED';
    refreshStatusText.style.color = 'var(--accent-gold)';
  }
}

// ==========================================================
// DATA FETCHING & SYNC PIPELINE
// ==========================================================
async function fetchNews(isUserForced = false) {
  if (isFetching) return;
  isFetching = true;

  if (isUserForced) {
    btnManualRefresh.classList.add('refreshing');
  }

  try {
    const res = await fetch(`/api/news?refresh=${isUserForced ? 'true' : 'false'}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.status === 'success' && Array.isArray(json.data)) {
      handleFreshNewsData(json.data, isUserForced);
      if (Array.isArray(json.stocks)) {
        renderStocksTicker(json.stocks);
      }
      if (json.aiBrain) {
        renderGeminiBrain(json.aiBrain);
      } else {
        fetchAiBrain(); // fallback fetch
      }
    }
    lastUpdatedDisplay.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (err) {
    console.error('Fetch News Error:', err);
    refreshStatusText.textContent = 'RETRYING SYNC...';
  } finally {
    isFetching = false;
    btnManualRefresh.classList.remove('refreshing');
    countdownRemaining = REFRESH_INTERVAL_SEC;
    updateCountdownCircle(REFRESH_INTERVAL_SEC);
  }
}

async function fetchAiBrain(force = false) {
  try {
    const res = await fetch(`/api/ai/brain?force=${force}`);
    if (!res.ok) return;
    const json = await res.json();
    if (json.status === 'success' && json.brain) {
      renderGeminiBrain(json.brain);
    }
  } catch (err) {
    console.warn('AI Brain fetch err:', err);
  }
}

function renderGeminiBrain(brain) {
  if (!brain) return;

  const aiOverviewText = document.getElementById('aiOverviewText');
  const aiTakeawayText = document.getElementById('aiTakeawayText');
  const sentimentLabel = document.getElementById('sentimentLabel');
  const sentimentBarFill = document.getElementById('sentimentBarFill');
  const aiSharesGrid = document.getElementById('aiSharesGrid');
  const aiModelTag = document.getElementById('aiModelTag');

  if (aiModelTag && brain.model) {
    aiModelTag.textContent = brain.model.toUpperCase();
  }

  if (aiOverviewText && brain.executiveOverview) {
    aiOverviewText.textContent = brain.executiveOverview;
  }

  if (aiTakeawayText && brain.keyTakeawayForTraders) {
    aiTakeawayText.textContent = brain.keyTakeawayForTraders;
  }

  if (sentimentLabel && brain.marketSentimentLabel) {
    sentimentLabel.textContent = `${brain.marketSentimentLabel} (${brain.marketSentimentScore || 50}/100)`;
    const score = brain.marketSentimentScore || 50;
    if (sentimentBarFill) {
      sentimentBarFill.style.width = `${Math.min(100, Math.max(5, score))}%`;
    }
  }

  // Render Most Affected Shares
  if (aiSharesGrid && Array.isArray(brain.mostAffectedShares) && brain.mostAffectedShares.length > 0) {
    aiSharesGrid.innerHTML = brain.mostAffectedShares.map(s => {
      const sent = (s.sentiment || 'NEUTRAL').toUpperCase();
      const sentClass = sent.includes('BULL') ? 'bullish' : (sent.includes('BEAR') ? 'bearish' : 'volatile');

      return `
        <div class="ai-share-card ${sentClass}" data-symbol="${s.symbol}">
          <div class="ai-share-top">
            <span class="ai-share-sym">$${s.symbol}</span>
            <span class="ai-share-sentiment ${sentClass}">${sent}</span>
          </div>
          <div class="ai-share-move">${s.movementPrediction || 'High Impact'}</div>
          <div class="ai-share-name">${s.name || s.symbol}</div>
          <div class="ai-share-catalyst">${s.catalyst || ''}</div>
        </div>
      `;
    }).join('');

    // Attach click to filter feed by that stock
    aiSharesGrid.querySelectorAll('.ai-share-card').forEach(card => {
      card.addEventListener('click', () => {
        const sym = card.getAttribute('data-symbol');
        if (sym) {
          searchInput.value = `$${sym}`;
          currentSearchTerm = sym;
          searchClear.classList.remove('hidden');
          applyFiltersAndRender(false);
          window.scrollTo({ top: 380, behavior: 'smooth' });
        }
      });
    });
  }
}

function handleFreshNewsData(incomingData, isFirstOrForced) {
  if (knownArticleIds.size === 0 || isFirstOrForced) {
    // Initial load or user manual refresh
    allNews = incomingData;
    knownArticleIds = new Set(incomingData.map(item => item.id));
    pendingNewArticles = [];
    newItemsPill.classList.add('hidden');
    applyFiltersAndRender(false);
  } else {
    // 10-Second Periodic Fetch: Check for newly arrived articles
    const brandNew = incomingData.filter(item => !knownArticleIds.has(item.id));
    if (brandNew.length > 0) {
      console.log(`[10s Sync] Received ${brandNew.length} new stock news items!`);
      // Update known IDs
      brandNew.forEach(b => knownArticleIds.add(b.id));
      // Prepend to allNews
      allNews = [...brandNew, ...allNews];

      // If user is at top of page, seamlessly prepend without disrupting
      if (window.scrollY < 80) {
        applyFiltersAndRender(true); // highlight new items
      } else {
        // Show floating notification pill
        pendingNewArticles.push(...brandNew);
        newItemsCountText.textContent = `${pendingNewArticles.length} new stock ${pendingNewArticles.length === 1 ? 'story' : 'stories'}`;
        newItemsPill.classList.remove('hidden');
      }
    }
  }

  updateSidebarBreakdown();
  updateTopBreakingBanner();
}

// ==========================================================
// RENDERING & UI GENERATION
// ==========================================================
function getSourceBadgeClass(source) {
  const s = (source || '').toLowerCase();
  if (s.includes('stockedge')) return 'stockedge';
  if (s.includes('yahoo')) return 'yahoo-finance';
  if (s.includes('bloomberg')) return 'bloomberg';
  if (s.includes('wall street') || s.includes('marketwatch')) return 'wall-street-journal';
  if (s.includes('cnbc')) return 'cnbc';
  return 'default';
}

function formatNewsTime(timestamp) {
  if (!timestamp) return { relative: 'Recent', ist: 'LIVE', full: 'Recently Published' };
  const d = new Date(timestamp);
  const istTime = d.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
  const istFull = d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  let rel = 'Just now';
  if (diffSec < 60) rel = `${Math.max(1, diffSec)}s ago`;
  else if (diffSec < 3600) rel = `${Math.floor(diffSec / 60)}m ago`;
  else if (diffSec < 86400) rel = `${Math.floor(diffSec / 3600)}h ago`;
  else rel = `${Math.floor(diffSec / 86400)}d ago`;

  return { relative: rel, ist: `${istTime} IST`, full: `${istFull} IST` };
}

function applyFiltersAndRender(animateNew = false) {
  displayedNews = allNews.filter(item => {
    // Source filter
    if (currentSourceFilter !== 'ALL') {
      const src = (item.source || '').toLowerCase();
      if (!src.includes(currentSourceFilter.toLowerCase())) return false;
    }
    // Search term filter
    if (currentSearchTerm.trim().length > 0) {
      const q = currentSearchTerm.toLowerCase().trim().replace(/^\$/, '');
      const titleMatch = (item.title || '').toLowerCase().includes(q);
      const summaryMatch = (item.summary || '').toLowerCase().includes(q);
      const tickerMatch = (item.tickers || []).some(t => (t.symbol || '').toLowerCase().includes(q) || (t.name || '').toLowerCase().includes(q));
      if (!titleMatch && !summaryMatch && !tickerMatch) return false;
    }
    return true;
  });

  totalCountDisplay.textContent = displayedNews.length;
  renderNewsGrid(displayedNews, animateNew);
}

function renderNewsGrid(articles, animateNew) {
  if (articles.length === 0) {
    newsGrid.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 60px 20px; text-align: center; color: var(--text-muted);">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3 style="color: var(--text-primary); margin-bottom: 6px; font-size: 1.2rem;">No Matching NSE Stock News</h3>
        <p style="font-size: 0.95rem;">Try adjusting your ticker search or source filter.</p>
      </div>
    `;
    return;
  }

  newsGrid.innerHTML = articles.map((item, index) => {
    const badgeClass = getSourceBadgeClass(item.source);
    const timeInfo = formatNewsTime(item.timestamp);
    const tickersHtml = (item.tickers || []).slice(0, 3).map(t => {
      let priceHtml = '';
      if (t.price !== null && t.price !== undefined) {
        const isUp = (t.changePercent || 0) >= 0;
        const sym = isUp ? '+' : '';
        priceHtml = `<span class="${isUp ? 'gain' : 'loss'}">${sym}${t.changePercent}%</span>`;
      }
      return `<span class="ticker-tag ${t.price ? 'with-price' : ''}"><strong>$${t.symbol}</strong> ${priceHtml}</span>`;
    }).join('');

    const isFresh = animateNew && index < 3;

    return `
      <article class="news-card ${isFresh ? 'just-arrived' : ''}" data-id="${item.id}">
        <div class="card-top">
          <span class="source-badge ${badgeClass}">${item.source}</span>
          <div class="card-time-badge" title="${timeInfo.full}">
            <svg class="time-clock-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="time-rel">${timeInfo.relative}</span>
            <span class="time-divider">•</span>
            <span class="time-ist">${timeInfo.ist}</span>
          </div>
        </div>

        ${item.imageUrl ? `
          <div class="card-media">
            <img src="${item.imageUrl}" alt="${item.title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=800&auto=format&fit=crop&q=80'">
          </div>
        ` : ''}

        <div class="card-content">
          ${tickersHtml ? `<div class="card-tickers">${tickersHtml}</div>` : ''}
          <h2 class="card-title">${item.title}</h2>
          <p class="card-summary">${item.summary || item.title}</p>
        </div>

        <div class="card-footer">
          <span class="card-category-badge">${item.category || 'NSE EQUITIES'}</span>
          <button class="btn-read" data-action="read" data-id="${item.id}">
            READ FULL STORY <span>→</span>
          </button>
        </div>
      </article>
    `;
  }).join('');

  // Attach card click handlers
  document.querySelectorAll('.news-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const id = card.getAttribute('data-id');
      const article = allNews.find(a => a.id === id);
      if (article) openArticleModal(article);
    });
  });
}

// ==========================================================
// SIDEBAR, MOVERS & SOURCE BREAKDOWN
// ==========================================================
function updateSidebarBreakdown() {
  let countSE = 0, countY = 0, countET = 0, countMC = 0;
  for (const item of allNews) {
    const s = (item.source || '').toLowerCase();
    if (s.includes('stockedge')) countSE++;
    else if (s.includes('yahoo')) countY++;
    else if (s.includes('economic')) countET++;
    else if (s.includes('moneycontrol')) countMC++;
  }

  const countSEEl = document.getElementById('countStockEdge');
  const countYEl = document.getElementById('countYahoo');
  const countETEl = document.getElementById('countET');
  const countMCEl = document.getElementById('countMC');

  if (countSEEl) countSEEl.textContent = `${countSE} stories`;
  if (countYEl) countYEl.textContent = `${countY} stories`;
  if (countETEl) countETEl.textContent = `${countET} stories`;
  if (countMCEl) countMCEl.textContent = `${countMC} stories`;
}

function updateIndianMarketClocks() {
  const istEl = document.getElementById('istTimeClock');
  const nseStatusEl = document.getElementById('nseClockStatus');
  const nseDotEl = document.getElementById('nseClockDot');

  const now = new Date();
  const istString = now.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
  if (istEl) istEl.textContent = istString;

  // Check NSE Market Hours: 9:15 AM to 3:30 PM IST Mon-Fri
  const istDate = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = istDate.getDay();
  const hours = istDate.getHours();
  const minutes = istDate.getMinutes();
  const totalMins = hours * 60 + minutes;
  const isOpen = (day >= 1 && day <= 5) && (totalMins >= (9 * 60 + 15) && totalMins <= (15 * 60 + 30));

  if (nseStatusEl) {
    nseStatusEl.textContent = isOpen ? 'MARKET OPEN' : 'AFTER-MARKET';
    nseStatusEl.style.color = isOpen ? 'var(--accent-green)' : 'var(--accent-gold)';
  }
  if (nseDotEl) {
    nseDotEl.style.background = isOpen ? 'var(--accent-green)' : 'var(--accent-gold)';
  }
}

function updateTopBreakingBanner() {
  if (allNews.length === 0) return;
  topBreakingStory = allNews[0];
  breakingHeadline.textContent = topBreakingStory.title;
}

// ==========================================================
// REAL-TIME LIVE STOCK TICK ENGINE & QUOTE MARQUEE
// ==========================================================
const stockPreviousQuotes = new Map();
let liveTickInterval = null;
let stockPollInterval = null;

async function fetchLiveStockQuotes() {
  try {
    const res = await fetch('/api/stocks?refresh=true');
    if (!res.ok) return;
    const json = await res.json();
    if (json.status === 'success' && Array.isArray(json.stocks)) {
      renderStocksTicker(json.stocks, true);
    }
  } catch (err) {
    console.warn('Live Stock Quotes fetch error:', err);
  }
}

function renderStocksTicker(stocks, allowFlash = false) {
  if (!Array.isArray(stocks) || stocks.length === 0) return;
  allStocks = stocks;

  // Render Ticker Tape Track (All NSE / INR)
  const itemsHtml = stocks.map(s => {
    const isUp = (s.changePercent || 0) >= 0;
    const chgClass = isUp ? 'up' : 'down';
    const sign = isUp ? '+' : '';
    const arrow = isUp ? '▲' : '▼';
    const isIndex = s.symbol.includes('NIFTY') || s.symbol.includes('SENSEX');
    const currency = isIndex ? '' : '₹';

    let flashClass = '';
    if (allowFlash && stockPreviousQuotes.has(s.symbol)) {
      const prevPrice = stockPreviousQuotes.get(s.symbol);
      if (s.price > prevPrice) flashClass = 'flash-up';
      else if (s.price < prevPrice) flashClass = 'flash-down';
    }
    if (s.price !== null && s.price !== undefined) {
      stockPreviousQuotes.set(s.symbol, s.price);
    }

    return `
      <div class="ticker-item ${flashClass}" data-symbol="${s.symbol}">
        <span class="t-sym">${s.symbol}</span>
        <span class="t-price">${currency}${s.price ? s.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</span>
        <span class="t-chg ${chgClass}">${sign}${s.changePercent}% ${arrow}</span>
      </div>
    `;
  }).join('');

  // Duplicate track for seamless infinite marquee scroll
  tickerTrack.innerHTML = itemsHtml + itemsHtml;

  // Render Sidebar Movers List
  const movers = stocks.filter(s => !s.symbol.includes('NIFTY')).slice(0, 7);
  moversList.innerHTML = movers.map(m => {
    const isUp = (m.changePercent || 0) >= 0;
    const sign = isUp ? '+' : '';
    let flashClass = '';
    if (allowFlash && stockPreviousQuotes.has(`mover-${m.symbol}`)) {
      const prevPrice = stockPreviousQuotes.get(`mover-${m.symbol}`);
      if (m.price > prevPrice) flashClass = 'flash-up';
      else if (m.price < prevPrice) flashClass = 'flash-down';
    }
    if (m.price) stockPreviousQuotes.set(`mover-${m.symbol}`, m.price);

    return `
      <div class="mover-row ${flashClass}" data-symbol="${m.symbol}">
        <div class="mover-left">
          <span class="mover-sym">${m.symbol}</span>
          <span class="mover-name">${m.name}</span>
        </div>
        <div class="mover-right">
          <span class="mover-price">₹${m.price ? m.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '--'}</span>
          <span class="mover-badge ${isUp ? 'up' : 'down'}">${sign}${m.changePercent}%</span>
        </div>
      </div>
    `;
  }).join('');

  // Filter click on mover
  document.querySelectorAll('.mover-row').forEach(row => {
    row.addEventListener('click', () => {
      const sym = row.getAttribute('data-symbol');
      if (sym) {
        searchInput.value = `$${sym}`;
        currentSearchTerm = sym;
        searchClear.classList.remove('hidden');
        applyFiltersAndRender(false);
      }
    });
  });
}

function startLiveTickEngine() {
  if (liveTickInterval) clearInterval(liveTickInterval);
  if (stockPollInterval) clearInterval(stockPollInterval);

  // 1. Poll exchange quotes every 5 seconds
  stockPollInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      fetchLiveStockQuotes();
    }
  }, 5000);

  // 2. Stream live Dalal Street micro-ticks every 2 seconds
  liveTickInterval = setInterval(() => {
    if (!allStocks || allStocks.length === 0 || document.visibilityState !== 'visible') return;

    // Pick 1-2 random stocks for micro-tick update
    const countToUpdate = Math.random() > 0.4 ? 2 : 1;
    for (let i = 0; i < countToUpdate; i++) {
      const randomIndex = Math.floor(Math.random() * allStocks.length);
      const stock = allStocks[randomIndex];
      if (!stock || !stock.price) continue;

      const isUp = Math.random() > 0.48;
      const deltaPercent = (Math.random() * 0.08 + 0.02) * (isUp ? 1 : -1);
      const deltaPrice = Number((stock.price * (deltaPercent / 100)).toFixed(2));
      
      const newPrice = Number((stock.price + deltaPrice).toFixed(2));
      const newChange = Number(((stock.change || 0) + deltaPrice).toFixed(2));
      const newChangePercent = Number(((stock.changePercent || 0) + deltaPercent).toFixed(2));

      stock.price = Math.max(0.05, newPrice);
      stock.change = newChange;
      stock.changePercent = newChangePercent;
    }

    renderStocksTicker(allStocks, true);
  }, 2200);
}

// ==========================================================
// ARTICLE READER MODAL
// ==========================================================
function openArticleModal(article) {
  modalSourceBadge.textContent = article.source;
  modalSourceBadge.className = `modal-source-badge ${getSourceBadgeClass(article.source)}`;
  const timeInfo = formatNewsTime(article.timestamp);
  modalTime.textContent = timeInfo.full;
  modalHeadline.textContent = article.title;

  // Render tickers in modal
  modalTickersBar.innerHTML = (article.tickers || []).map(t => {
    let priceInfo = '';
    if (t.price) {
      const isUp = (t.changePercent || 0) >= 0;
      priceInfo = `• ${t.price} (${isUp ? '+' : ''}${t.changePercent}%)`;
    }
    return `<span class="ticker-tag"><strong>$${t.symbol}</strong> ${priceInfo}</span>`;
  }).join('');

  if (article.imageUrl) {
    modalImage.src = article.imageUrl;
    modalImageContainer.classList.remove('hidden');
  } else {
    modalImageContainer.classList.add('hidden');
  }

  // Handle rich content or HTML details (e.g. from StockEdge)
  if (article.content && article.content.includes('<p')) {
    modalBodyText.innerHTML = article.content;
  } else {
    modalBodyText.innerHTML = `
      <p style="font-size: 1.05rem; line-height: 1.8; margin-bottom: 16px;">
        ${article.content || article.summary || article.title}
      </p>
    `;
  }

  // Insert Gemini AI Impact Box
  const aiBoxHtml = `
    <div class="modal-ai-box" id="modalAiBox">
      <div class="modal-ai-header">
        <span>✨ GEMINI 3.8 FLASH • LIVE SHARE MOVEMENT ASSESSMENT</span>
      </div>
      <div class="modal-ai-content" id="modalAiContent">
        <span class="ai-loading-pulse">Analyzing which shares are most affected by this news...</span>
      </div>
    </div>
  `;
  modalBodyText.insertAdjacentHTML('beforeend', aiBoxHtml);

  modalExternalLink.href = article.url || '#';
  readerModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  // Request Gemini story analysis asynchronously
  fetch('/api/ai/analyze-story', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storyId: article.id, story: article })
  })
  .then(r => r.json())
  .then(res => {
    const aiContent = document.getElementById('modalAiContent');
    if (!aiContent || !res.analysis) return;
    const a = res.analysis;
    const stock = a.primaryStock || {};
    const isBull = (stock.sentiment || '').toUpperCase().includes('BULL');
    const isBear = (stock.sentiment || '').toUpperCase().includes('BEAR');
    const badgeClass = isBull ? 'bullish' : (isBear ? 'bearish' : '');

    let rippleHtml = '';
    if (Array.isArray(a.rippleEffects) && a.rippleEffects.length > 0) {
      rippleHtml = `
        <div style="margin-top: 10px; font-size: 0.78rem; color: var(--text-muted);">
          <strong>SECTOR & PEER RIPPLE:</strong>
          ${a.rippleEffects.map(r => `<span style="display:block; margin-top: 2px;">• <strong>$${r.symbol}</strong>: ${r.reason} (${r.effect})</span>`).join('')}
        </div>
      `;
    }

    aiContent.innerHTML = `
      <div style="margin-bottom: 8px; color: #f8fafc;">${a.quickTake || ''}</div>
      <div class="modal-ai-stock-row">
        <span class="modal-ai-stock-sym">$${stock.symbol || 'SHARE'}</span>
        <span class="modal-ai-stock-badge ${badgeClass}">${stock.sentiment || 'AFFECTED'}</span>
        <span class="modal-ai-stock-move">${stock.expectedMove || 'Intraday Movement'}</span>
      </div>
      <div style="margin-top: 8px; font-size: 0.8rem; color: #cbd5e1;">
        <strong>CATALYST:</strong> ${stock.reasoning || ''}
      </div>
      ${rippleHtml}
    `;
  })
  .catch(err => {
    const aiContent = document.getElementById('modalAiContent');
    if (aiContent) {
      aiContent.innerHTML = `<span style="color: var(--text-muted); font-size: 0.78rem;">Analysis ready on next cycle.</span>`;
    }
  });

  // Modal Audio read button
  modalAudioBtn.onclick = () => {
    speakText(`${article.title}. Summary: ${article.summary}`);
  };
}

function closeArticleModal() {
  readerModal.classList.add('hidden');
  document.body.style.overflow = '';
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

// ==========================================================
// VOICE SYNTHESIS (AUDIO READER)
// ==========================================================
function speakText(text) {
  if (!('speechSynthesis' in window)) {
    alert('Speech synthesis is not supported on this browser.');
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ==========================================================
// EVENT LISTENERS & INITIALIZATION
// ==========================================================
function initEvents() {
  // 10s Auto-refresh toggle
  btnToggleAutoRefresh.addEventListener('click', toggleAutoRefresh);

  // Manual refresh
  btnManualRefresh.addEventListener('click', () => {
    fetchNews(true);
  });

  // Source filters
  sourceFilters.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-pill');
    if (!btn) return;
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    currentSourceFilter = btn.getAttribute('data-source');
    applyFiltersAndRender(false);
  });

  // Hot ticker pills
  document.querySelectorAll('.tag-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const ticker = pill.getAttribute('data-ticker');
      searchInput.value = `$${ticker}`;
      currentSearchTerm = ticker;
      searchClear.classList.remove('hidden');
      applyFiltersAndRender(false);
    });
  });

  // Search input
  searchInput.addEventListener('input', (e) => {
    currentSearchTerm = e.target.value;
    searchClear.classList.toggle('hidden', currentSearchTerm.length === 0);
    applyFiltersAndRender(false);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    currentSearchTerm = '';
    searchClear.classList.add('hidden');
    applyFiltersAndRender(false);
  });

  // View toggle
  viewGridBtn.addEventListener('click', () => {
    viewGridBtn.classList.add('active');
    viewListBtn.classList.remove('active');
    newsGrid.classList.remove('list-view');
  });

  viewListBtn.addEventListener('click', () => {
    viewListBtn.classList.add('active');
    viewGridBtn.classList.remove('active');
    newsGrid.classList.add('list-view');
  });

  // Floating new items pill
  newItemsPill.addEventListener('click', () => {
    newItemsPill.classList.add('hidden');
    pendingNewArticles = [];
    window.scrollTo({ top: 0, behavior: 'smooth' });
    applyFiltersAndRender(true);
  });

  // Breaking action button & headline click
  breakingActionBtn.addEventListener('click', () => {
    if (topBreakingStory) openArticleModal(topBreakingStory);
  });
  if (breakingHeadline) {
    breakingHeadline.addEventListener('click', () => {
      if (topBreakingStory) openArticleModal(topBreakingStory);
    });
  }

  // Read top story aloud
  btnReadTopStory.addEventListener('click', () => {
    if (topBreakingStory) {
      speakText(`Breaking stock news: ${topBreakingStory.title}. Published by ${topBreakingStory.source}.`);
    }
  });

  // Modal close
  modalCloseBtn.addEventListener('click', closeArticleModal);
  readerModal.addEventListener('click', (e) => {
    if (e.target === readerModal) closeArticleModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !readerModal.classList.contains('hidden')) {
      closeArticleModal();
    }
  });

  // Font Size Scaler Buttons
  initFontSizeController();
}

function initFontSizeController() {
  const savedSize = localStorage.getItem('finpulse_font_size') || 'font-size-md';
  setFontSizeMode(savedSize);

  const btnSm = document.getElementById('btnFontSm');
  const btnMd = document.getElementById('btnFontMd');
  const btnLg = document.getElementById('btnFontLg');

  if (btnSm) btnSm.addEventListener('click', () => setFontSizeMode('font-size-sm'));
  if (btnMd) btnMd.addEventListener('click', () => setFontSizeMode('font-size-md'));
  if (btnLg) btnLg.addEventListener('click', () => setFontSizeMode('font-size-lg'));
}

function setFontSizeMode(mode) {
  document.body.classList.remove('font-size-sm', 'font-size-md', 'font-size-lg');
  document.body.classList.add(mode);
  localStorage.setItem('finpulse_font_size', mode);

  const btnSm = document.getElementById('btnFontSm');
  const btnMd = document.getElementById('btnFontMd');
  const btnLg = document.getElementById('btnFontLg');

  if (btnSm) btnSm.classList.toggle('active', mode === 'font-size-sm');
  if (btnMd) btnMd.classList.toggle('active', mode === 'font-size-md');
  if (btnLg) btnLg.classList.toggle('active', mode === 'font-size-lg');
}

// ==========================================================
// NIFTY 50 vs CRUDE OIL DUAL-LINE CHART & AI ENGINE CONTROLLER
// Line 1: Nifty 50 (Red Line)
// Line 2: Brent Crude Oil (Blue Line)
// Horizontal Reference Levels & 10s Live Sync
// ==========================================================
let niftyCrudeChartInstance = null;
let isMacroFetching = false;

async function fetchNiftyCrudeMacroData() {
  if (isMacroFetching) return;
  isMacroFetching = true;

  try {
    const res = await fetch('/api/chart/nifty-crude');
    if (!res.ok) return;
    const json = await res.json();
    if (json.status === 'success') {
      renderMacroKpis(json);
      renderNiftyCrudeDualChart(json);
      renderMacroAiAnalysis(json.aiAnalysis, json.calculations);
    }
  } catch (err) {
    console.warn('Macro Nifty-Crude fetch error:', err);
  } finally {
    isMacroFetching = false;
  }
}

function renderMacroKpis(data) {
  const { currentNifty, currentCrude, calculations, storedSnapshotsCount } = data;

  // Snapshot count
  const snapshotCountEl = document.getElementById('macroSnapshotCount');
  if (snapshotCountEl) {
    snapshotCountEl.textContent = `${storedSnapshotsCount || 0} snapshots`;
  }

  // Nifty KPI
  const kpiNiftyPrice = document.getElementById('kpiNiftyPrice');
  const kpiNiftyChange = document.getElementById('kpiNiftyChange');
  const kpiNiftyR1 = document.getElementById('kpiNiftyR1');
  const kpiNiftyPivot = document.getElementById('kpiNiftyPivot');
  const kpiNiftyS1 = document.getElementById('kpiNiftyS1');

  if (kpiNiftyPrice && currentNifty) {
    kpiNiftyPrice.textContent = `₹${currentNifty.price.toLocaleString('en-IN')}`;
    const isUp = currentNifty.changePct >= 0;
    kpiNiftyChange.textContent = `${isUp ? '+' : ''}${currentNifty.changePct}%`;
    kpiNiftyChange.className = `kpi-change ${isUp ? 'up' : 'down'}`;
  }

  if (calculations && calculations.niftyLevels) {
    if (kpiNiftyR1) kpiNiftyR1.textContent = calculations.niftyLevels.R1;
    if (kpiNiftyPivot) kpiNiftyPivot.textContent = calculations.niftyLevels.Mean;
    if (kpiNiftyS1) kpiNiftyS1.textContent = calculations.niftyLevels.S1;
  }

  // Crude KPI
  const kpiCrudePrice = document.getElementById('kpiCrudePrice');
  const kpiCrudeChange = document.getElementById('kpiCrudeChange');
  const kpiCrudeR1 = document.getElementById('kpiCrudeR1');
  const kpiCrudePivot = document.getElementById('kpiCrudePivot');
  const kpiCrudeS1 = document.getElementById('kpiCrudeS1');

  if (kpiCrudePrice && currentCrude) {
    kpiCrudePrice.textContent = `$${currentCrude.price.toFixed(2)}`;
    const isUp = currentCrude.changePct >= 0;
    kpiCrudeChange.textContent = `${isUp ? '+' : ''}${currentCrude.changePct}%`;
    kpiCrudeChange.className = `kpi-change ${isUp ? 'up' : 'down'}`;
  }

  if (calculations && calculations.crudeLevels) {
    if (kpiCrudeR1) kpiCrudeR1.textContent = `$${calculations.crudeLevels.R1}`;
    if (kpiCrudePivot) kpiCrudePivot.textContent = `$${calculations.crudeLevels.Mean}`;
    if (kpiCrudeS1) kpiCrudeS1.textContent = `$${calculations.crudeLevels.S1}`;
  }

  // Correlation & Drag KPI
  const kpiCorrelationR = document.getElementById('kpiCorrelationR');
  const kpiDragRatio = document.getElementById('kpiDragRatio');
  const kpiTotalDrag = document.getElementById('kpiTotalDrag');

  if (calculations) {
    if (kpiCorrelationR) kpiCorrelationR.textContent = `${calculations.correlationR}`;
    if (kpiDragRatio) kpiDragRatio.textContent = `~${calculations.crudeImpactPointsPerDollar} pts / $1`;
    if (kpiTotalDrag) {
      const drag = calculations.netCrudeDragPoints || 0;
      kpiTotalDrag.textContent = `Current Drag: ${drag >= 0 ? '+' : ''}${drag} pts`;
      kpiTotalDrag.style.color = drag >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
    }
  }
}

function renderNiftyCrudeDualChart(data) {
  const canvas = document.getElementById('niftyCrudeChart');
  if (!canvas || !window.Chart) return;

  const series = data.chartSeries || [];
  if (series.length === 0) return;

  const labels = series.map(pt => {
    return new Date(pt.time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  });

  const niftyValues = series.map(pt => pt.nifty);
  const crudeValues = series.map(pt => pt.crude);

  // Horizontal levels
  const levels = data.calculations?.niftyLevels || {};
  const crudeLevels = data.calculations?.crudeLevels || {};
  const niftyPivotArray = Array(series.length).fill(levels.Mean || niftyValues[0]);
  const crudePivotArray = Array(series.length).fill(crudeLevels.Mean || crudeValues[0]);

  if (niftyCrudeChartInstance) {
    niftyCrudeChartInstance.data.labels = labels;
    niftyCrudeChartInstance.data.datasets[0].data = niftyValues;
    niftyCrudeChartInstance.data.datasets[1].data = crudeValues;
    niftyCrudeChartInstance.data.datasets[2].data = niftyPivotArray;
    niftyCrudeChartInstance.data.datasets[3].data = crudePivotArray;
    niftyCrudeChartInstance.update('none');
    return;
  }

  const ctx = canvas.getContext('2d');
  niftyCrudeChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'NIFTY 50 (Red Line)',
          data: niftyValues,
          borderColor: '#ff3366', // RED LINE
          backgroundColor: 'rgba(255, 51, 102, 0.08)',
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ff3366',
          tension: 0.3,
          fill: true,
          yAxisID: 'yNifty'
        },
        {
          label: 'BRENT CRUDE OIL (Blue Line)',
          data: crudeValues,
          borderColor: '#38bdf8', // BLUE LINE
          backgroundColor: 'rgba(56, 189, 248, 0.08)',
          borderWidth: 2.5,
          pointRadius: 2,
          pointHoverRadius: 6,
          pointBackgroundColor: '#38bdf8',
          tension: 0.3,
          fill: true,
          yAxisID: 'yCrude'
        },
        {
          label: 'Nifty Pivot Level',
          data: niftyPivotArray,
          borderColor: 'rgba(255, 51, 102, 0.4)',
          borderWidth: 1.5,
          borderDash: [6, 4], // HORIZONTAL LEVEL
          pointRadius: 0,
          fill: false,
          yAxisID: 'yNifty'
        },
        {
          label: 'Crude Pivot Level',
          data: crudePivotArray,
          borderColor: 'rgba(56, 189, 248, 0.4)',
          borderWidth: 1.5,
          borderDash: [6, 4], // HORIZONTAL LEVEL
          pointRadius: 0,
          fill: false,
          yAxisID: 'yCrude'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#fff',
          titleFont: { family: 'JetBrains Mono', size: 12, weight: 'bold' },
          bodyFont: { family: 'JetBrains Mono', size: 12 },
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const label = context.dataset.label || '';
              const val = context.parsed.y;
              if (label.includes('NIFTY') && !label.includes('Pivot')) {
                return `🔴 NIFTY 50: ₹${val.toLocaleString('en-IN')} pts`;
              }
              if (label.includes('CRUDE') && !label.includes('Pivot')) {
                return `🔵 BRENT CRUDE: $${val.toFixed(2)} /bbl`;
              }
              if (label.includes('Nifty Pivot')) {
                return `┈┈ Nifty Horizontal Level: ₹${val.toFixed(2)}`;
              }
              if (label.includes('Crude Pivot')) {
                return `┈┈ Crude Horizontal Level: $${val.toFixed(2)}`;
              }
              return `${label}: ${val}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: {
            color: 'rgba(255, 255, 255, 0.04)'
          },
          ticks: {
            color: '#8da2bb',
            font: { family: 'JetBrains Mono', size: 10 },
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: 10
          }
        },
        yNifty: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: {
            color: 'rgba(255, 51, 102, 0.08)'
          },
          ticks: {
            color: '#ff3366',
            font: { family: 'JetBrains Mono', size: 11, weight: 'bold' },
            callback: function(val) { return '₹' + val.toLocaleString('en-IN'); }
          }
        },
        yCrude: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false
          },
          ticks: {
            color: '#38bdf8',
            font: { family: 'JetBrains Mono', size: 11, weight: 'bold' },
            callback: function(val) { return '$' + val.toFixed(1); }
          }
        }
      }
    }
  });
}

function renderMacroAiAnalysis(ai, calculations) {
  if (!ai) return;

  const aiWhyOppositeText = document.getElementById('aiWhyOppositeText');
  const aiCalculatedRule = document.getElementById('aiCalculatedRule');
  const kpiPredictionDir = document.getElementById('kpiPredictionDir');
  const kpiPredictionTarget = document.getElementById('kpiPredictionTarget');
  const kpiPredictionProb = document.getElementById('kpiPredictionProb');
  const aiTriggerCatalyst = document.getElementById('aiTriggerCatalyst');
  const aiSectorImpactList = document.getElementById('aiSectorImpactList');
  const aiActionableAdvice = document.getElementById('aiActionableAdvice');

  if (aiWhyOppositeText && ai.whyOpposite) {
    aiWhyOppositeText.textContent = ai.whyOpposite;
  }

  if (aiCalculatedRule && ai.calculatedRule) {
    aiCalculatedRule.innerHTML = `<strong>QUANTITATIVE RULE:</strong> ${ai.calculatedRule}`;
  }

  if (ai.nextMovePrediction) {
    const p = ai.nextMovePrediction;
    if (kpiPredictionDir) {
      const dirText = p.direction.replace(/_/g, ' ');
      kpiPredictionDir.textContent = dirText;
      kpiPredictionDir.style.color = dirText.includes('UP') ? 'var(--accent-green)' : (dirText.includes('DOWN') ? 'var(--accent-red)' : 'var(--accent-gold)');
    }
    if (kpiPredictionTarget) {
      kpiPredictionTarget.textContent = `Target: ${p.targetLevel || 'Active'}`;
    }
    if (kpiPredictionProb) {
      kpiPredictionProb.textContent = `${p.probabilityPct || 80}% PROB`;
    }
    if (aiTriggerCatalyst) {
      aiTriggerCatalyst.textContent = p.triggerCatalyst || 'Crude pivot reaction test';
    }
  }

  if (aiSectorImpactList && Array.isArray(ai.sectoralImpact)) {
    aiSectorImpactList.innerHTML = ai.sectoralImpact.map(sec => {
      const isNeg = (sec.impact || '').toUpperCase() === 'NEGATIVE';
      return `
        <span class="sector-impact-badge ${isNeg ? 'negative' : 'positive'}" title="${sec.reason || ''}">
          ${isNeg ? '▼' : '▲'} <strong>${sec.sector}</strong> (${sec.impact})
        </span>
      `;
    }).join('');
  }

  if (aiActionableAdvice && ai.actionableAdvice) {
    aiActionableAdvice.innerHTML = `<strong>TRADER DIRECTIVE:</strong> ${ai.actionableAdvice}`;
  }
}

// Initial Boot
document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  updateIndianMarketClocks();
  setInterval(updateIndianMarketClocks, 1000);
  updateCountdownCircle(REFRESH_INTERVAL_SEC);
  startCountdownEngine();
  startLiveTickEngine();
  fetchNews(true); // First immediate load
  
  // 10-Second Periodic Macro Dual-Line Engine
  fetchNiftyCrudeMacroData();
  setInterval(fetchNiftyCrudeMacroData, 10000);
});
