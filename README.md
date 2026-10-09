# FINPULSE // Real-Time Indian Stock News & NIFTY-Crude AI Macro Terminal

![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)
![Chart.js](https://img.shields.io/badge/Chart.js-4.4-blue.svg)
![Gemini AI](https://img.shields.io/badge/Google%20Gemini-3.8%20Flash-orange.svg)
![NSE Market](https://img.shields.io/badge/Market-NSE%20India%20%26%20Global-purple.svg)
![License](https://img.shields.io/badge/License-MIT-brightgreen.svg)

A high-frequency institutional-grade financial terminal built for Dalal Street and global macro analysis. It aggregates live stock news across financial APIs (StockEdge, Yahoo Finance India, Economic Times, Moneycontrol), tracks real-time tick-by-tick prices, features a dual-line **NIFTY 50 vs. Brent Crude Oil** inter-market monitor, and runs automated **Google Gemini AI** macro impact models every 10 seconds.

---

## ⚡ Core Features

### 1. 🔴 NIFTY 50 vs. 🔵 Brent Crude Oil Dual-Line Engine
- **Single-Screen Dual-Axis Canvas**: Nifty 50 plotted on the left axis (**Red Line**), Brent Crude Oil plotted on the right axis (**Blue Line**).
- **Horizontal Reference Levels**: Intraday Pivot Mean, Resistance 1 (**R1**), and Support 1 (**S1**) horizontal benchmark lines.
- **Inter-Asset Mathematics**:
  - Live **Pearson Correlation ($r$)** tracking inverse macro relationship (typically $-0.8$ to $-0.85$).
  - **Beta Sensitivity & Elasticity**: Measures Nifty point drag per $\$1$ crude spike.
  - **Dynamic Drag / Relief Points**: Quantifies exact index drag points.
- **10-Second Historical Snapshot Stream**: Appends session snapshots to `data/nifty_crude_history.json` for cumulative momentum analysis.

### 2. 🤖 Google Gemini AI Macro Brain & "Next Move" Predictor
- Powered by Google Gemini (`gemini-3.8-flash` & `gemini-3.5-flash`) with automatic multi-key rotation and zero-delay resilience.
- **Inverse Macro Catalyst Synthesis**: Details why India's 85% crude oil import bill affects inflation, currency, and index valuation.
- **Predictive Direction & Target**: Forecasts Nifty 50's next move (`UPWARD_RELIEF`, `BREAKDOWN_RISK`, `CONSOLIDATION`), target levels, and win-probability %.
- **Sectoral Impact Matrix**: Identifies winners (Paints, Chemicals, Aviation) vs losers (Upstream Oil & Gas).
- **Trader Directives**: Provides high-conviction risk-managed trading setups with entry, exit, and stop-loss levels.

### 3. 📰 Real-Time NSE News Aggregator (10-Second Auto-Refresh)
- Aggregates 115+ live stock stories from:
  - **StockEdge API**: Live corporate announcements, board actions, and volume spikes.
  - **Yahoo Finance India**: Dalal Street equities and index coverage.
  - **The Economic Times & Moneycontrol**: Earnings releases and policy updates.
- **SVG Circular Countdown Ring**: Visual 10-second countdown indicator with manual pause/play and instant refresh.
- **Stock Movement Assessment**: Gemini automatically highlights which shares will move the most for any breaking news headline.

### 4. 📈 Dalal Street Ticker Tape & Live Price Ticks
- Live quotes and 2-second micro-ticks for top NSE stocks (Reliance, TCS, HDFC Bank, Infosys, ICICI Bank, Tata Motors, SBI, etc.).
- Real-time flash animations: glowing green for upward ticks, glowing red for downward ticks.
- Dynamic IST Clock with live **NSE MARKET OPEN / AFTER-MARKET** status indicator.

---

## 🚀 Quickstart Guide

### Prerequisites
- [Node.js](https://nodejs.org/) v20 or higher (built-in `fetch` & `process.loadEnvFile` support).
- No external npm dependencies required — runs completely on zero third-party dependencies!

### 1. Clone the Repository
```bash
git clone https://github.com/YAGNIKHARIYANI/market.git
cd market
```

### 2. Configure Environment Variables
Copy the `.env.example` file to `.env`:
```bash
cp .env.example .env
```
Open `.env` and add your Google Gemini API key:
```env
PORT=3000
GEMINI_API_KEYS=your_gemini_api_key_here
```
*(You can pass multiple comma-separated keys for automatic high-volume load rotation).*

### 3. Launch the Server
```bash
npm start
# or
node server.js
```

### 4. Access the Terminal
Open your web browser and navigate to:
```
http://localhost:3000
```

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|---|---|---|
| `/api/news` | `GET` | Fetches aggregated NSE market stories with sentiment and ticker symbols. Supports `?refresh=true`. |
| `/api/stocks` | `GET` | Returns live prices, % change, and high/lows for top NSE equities and indices. |
| `/api/chart/nifty-crude` | `GET` | Returns synchronized 5-min chart data for Nifty 50 and Brent Crude, horizontal levels, correlation, and Gemini AI analysis. |
| `/api/ai/overview` | `GET` | Fetches Gemini AI broad market overview and sector momentum analysis. |
| `/api/ai/analyze-story` | `POST` | Generates deep stock impact and ripple effects for an individual news article. |

---

## 📂 Project Structure

```
market/
├── server.js                  # Node.js HTTP/SSE server & API router
├── geminiBrain.js             # Gemini AI brain, multi-key rotation & news analysis
├── niftyCrudeEngine.js        # Nifty-Crude sync engine, calculations & historical logger
├── package.json               # Package configuration & start script
├── .env.example               # Template for environment variables
├── .gitignore                 # Secret and dependency exclusion rules
├── data/
│   └── nifty_crude_history.json  # Persistent 10-second inter-asset snapshot database
└── public/
    ├── index.html             # Terminal UI layout & panels
    ├── styles.css             # Institutional dark-mode stylesheet & typography
    └── app.js                 # Frontend state, Chart.js dual-axis renderer & live sync
```

---

## 🛡️ License
Distributed under the MIT License. Feel free to fork, customize, and build upon this terminal.
