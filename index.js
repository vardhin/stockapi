const axios = require('axios');
const express = require('express');
const StockDatabase = require('./database/db');
const app = express();

// Initialize database
const db = new StockDatabase();

// Middleware
app.use(express.json());

// Enhanced axios instance with better headers
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Origin': 'https://finance.yahoo.com',
        'Referer': 'https://finance.yahoo.com/',
    },
    timeout: 15000
});

// Improved simple data function with caching
async function getSimpleStockData(symbol, useCache = true) {
    // Check cache first
    if (useCache) {
        const cached = await db.getCachedQuote(symbol, 5); // 5 minutes cache
        if (cached) {
            console.log(`📊 Cache hit for ${symbol}`);
            return {
                symbol: cached.symbol,
                currentPrice: cached.current_price,
                previousClose: cached.previous_close,
                dayHigh: cached.day_high,
                dayLow: cached.day_low,
                volume: cached.volume,
                currency: 'INR',
                exchangeName: 'NSI',
                source: 'Database Cache',
                cached: true,
                lastUpdated: cached.last_updated
            };
        }
    }

    const endpoints = [
        `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS`,
        `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.NS`,
        `https://finance.yahoo.com/quote/${symbol}.NS`,
    ];
    
    for (const url of endpoints) {
        try {
            const response = await axiosInstance.get(url);
            if (response.data?.chart?.result?.[0]) {
                const data = response.data.chart.result[0];
                const meta = data.meta;
                
                const stockData = {
                    symbol: meta.symbol,
                    currentPrice: meta.regularMarketPrice,
                    previousClose: meta.previousClose,
                    dayHigh: meta.regularMarketDayHigh,
                    dayLow: meta.regularMarketDayLow,
                    volume: meta.regularMarketVolume,
                    currency: meta.currency,
                    exchangeName: meta.exchangeName,
                    source: 'Yahoo Finance Chart API',
                    cached: false
                };
                
                // Cache the data
                if (useCache) {
                    try {
                        await db.cacheQuote(symbol, stockData);
                        console.log(`💾 Cached data for ${symbol}`);
                    } catch (cacheError) {
                        console.error('Cache error:', cacheError);
                    }
                }
                
                return stockData;
            }
        } catch (error) {
            console.log(`Failed endpoint ${url}: ${error.message}`);
            continue;
        }
    }
    throw new Error(`All endpoints failed for ${symbol}`);
}

// Historical data function with caching
async function getHistoricalData(symbol, period = '1d', interval = '1m', useCache = true) {
    // Check cache first
    if (useCache) {
        const cached = await db.getCachedHistoricalData(symbol, period, 1); // 1 hour cache
        if (cached && cached.length > 0) {
            console.log(`📊 Cache hit for ${symbol} historical data (${period})`);
            return {
                meta: { symbol: symbol },
                timestamp: cached.map(row => row.timestamp / 1000),
                indicators: {
                    quote: [{
                        open: cached.map(row => row.open_price),
                        high: cached.map(row => row.high_price),
                        low: cached.map(row => row.low_price),
                        close: cached.map(row => row.close_price),
                        volume: cached.map(row => row.volume)
                    }]
                },
                cached: true
            };
        }
    }

    try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=${period}&interval=${interval}`;
        const response = await axiosInstance.get(url);
        const data = response.data.chart.result[0];
        
        // Cache the historical data
        if (useCache && data.timestamp) {
            try {
                const timestamps = data.timestamp;
                const quotes = data.indicators.quote[0];
                
                const historicalData = timestamps.map((timestamp, index) => ({
                    time: new Date(timestamp * 1000).toISOString(),
                    date: new Date(timestamp * 1000).toISOString().split('T')[0],
                    open: quotes.open[index],
                    high: quotes.high[index],
                    low: quotes.low[index],
                    close: quotes.close[index],
                    volume: quotes.volume[index]
                }));
                
                await db.cacheHistoricalData(symbol, period, interval, historicalData);
                console.log(`💾 Cached historical data for ${symbol} (${period})`);
            } catch (cacheError) {
                console.error('Historical cache error:', cacheError);
            }
        }
        
        return { ...data, cached: false };
    } catch (error) {
        // Fallback to different endpoint
        try {
            const fallbackUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}.NS?range=${period}&interval=${interval}`;
            const response = await axiosInstance.get(fallbackUrl);
            return { ...response.data.chart.result[0], cached: false };
        } catch (fallbackError) {
            throw new Error(`Failed to fetch historical data for ${symbol}: ${error.response?.status || error.message}`);
        }
    }
}

// Alternative data source function (NSE API)
async function getNSEData(symbol) {
    try {
        const url = `https://www.nseindia.com/api/quote-equity?symbol=${symbol}`;
        const response = await axiosInstance.get(url, {
            headers: {
                ...axiosInstance.defaults.headers,
                'Referer': 'https://www.nseindia.com/',
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        return response.data;
    } catch (error) {
        throw new Error(`NSE API failed for ${symbol}: ${error.message}`);
    }
}

// ENDPOINTS

// 1. Simple and reliable quote endpoint with caching
app.get('/api/simple/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query; // Allow bypassing cache with ?nocache=true
        const useCache = nocache !== 'true';
        
        const data = await getSimpleStockData(symbol, useCache);
        res.json(data);
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            suggestion: 'Try a different stock symbol (e.g., RELIANCE, TCS, INFY)'
        });
    }
});

// 2. Enhanced quote with multiple fallbacks and caching
app.get('/api/stock/:symbol/quote', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        // Try simple method first
        try {
            const data = await getSimpleStockData(symbol, useCache);
            return res.json({
                ...data,
                change: data.currentPrice - data.previousClose,
                changePercent: ((data.currentPrice - data.previousClose) / data.previousClose) * 100
            });
        } catch (simpleError) {
            console.log('Simple method failed:', simpleError.message);
        }
    } catch (error) {
        res.status(500).json({ 
            error: error.message,
            suggestion: 'Check if the stock symbol is correct and market is open'
        });
    }
});

// 3. Debug endpoint to test different methods
app.get('/api/test/:symbol', async (req, res) => {
    const { symbol } = req.params;
    const results = {};
    
    // Test simple method
    try {
        const simpleData = await getSimpleStockData(symbol);
        results.simple = { status: 'success', data: simpleData };
    } catch (error) {
        results.simple = { status: 'failed', error: error.message };
    }
    
    res.json(results);
});

// 4. Working comparison endpoint with caching
app.post('/api/stocks/compare', async (req, res) => {
    try {
        const { symbols } = req.body;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        if (!symbols || !Array.isArray(symbols)) {
            return res.status(400).json({ error: 'Please provide an array of stock symbols' });
        }
        
        const stockData = [];
        for (const symbol of symbols) {
            try {
                const data = await getSimpleStockData(symbol, useCache);
                stockData.push({
                    symbol: data.symbol,
                    currentPrice: data.currentPrice,
                    previousClose: data.previousClose,
                    change: data.currentPrice - data.previousClose,
                    changePercent: ((data.currentPrice - data.previousClose) / data.previousClose) * 100,
                    volume: data.volume,
                    currency: data.currency,
                    cached: data.cached
                });
            } catch (error) {
                stockData.push({
                    symbol: symbol,
                    error: `Failed to fetch data: ${error.message}`
                });
            }
            
            // Add delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        
        res.json({ stocks: stockData });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Historical data endpoints with caching

// 6. 1-day intraday data (1-minute intervals)
app.get('/api/stock/:symbol/1d', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getHistoricalData(symbol, '1d', '1m', useCache);
        const timestamps = data.timestamp;
        const quotes = data.indicators.quote[0];
        
        const dayData = timestamps.map((timestamp, index) => ({
            time: new Date(timestamp * 1000).toISOString(),
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
        }));
        
        res.json({
            symbol: data.meta.symbol,
            period: '1d',
            interval: '1m',
            cached: data.cached || false,
            data: dayData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 7. 5-day data (5-minute intervals)
app.get('/api/stock/:symbol/5d', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getHistoricalData(symbol, '5d', '5m', useCache);
        const timestamps = data.timestamp;
        const quotes = data.indicators.quote[0];
        
        const weekData = timestamps.map((timestamp, index) => ({
            time: new Date(timestamp * 1000).toISOString(),
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
        }));
        
        res.json({
            symbol: data.meta.symbol,
            period: '5d',
            interval: '5m',
            cached: data.cached || false,
            data: weekData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 8. 1-month data (daily intervals)
app.get('/api/stock/:symbol/1mo', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getHistoricalData(symbol, '1mo', '1d', useCache);
        const timestamps = data.timestamp;
        const quotes = data.indicators.quote[0];
        
        const monthData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
        }));
        
        res.json({
            symbol: data.meta.symbol,
            period: '1mo',
            interval: '1d',
            cached: data.cached || false,
            data: monthData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 9. 3-month data (daily intervals)
app.get('/api/stock/:symbol/3mo', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getHistoricalData(symbol, '3mo', '1d', useCache);
        const timestamps = data.timestamp;
        const quotes = data.indicators.quote[0];
        
        const quarterData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
        }));
        
        res.json({
            symbol: data.meta.symbol,
            period: '3mo',
            interval: '1d',
            cached: data.cached || false,
            data: quarterData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 10. 1-year data (weekly intervals)
app.get('/api/stock/:symbol/1y', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getHistoricalData(symbol, '1y', '1wk', useCache);
        const timestamps = data.timestamp;
        const quotes = data.indicators.quote[0];
        
        const yearData = timestamps.map((timestamp, index) => ({
            date: new Date(timestamp * 1000).toISOString().split('T')[0],
            open: quotes.open[index],
            high: quotes.high[index],
            low: quotes.low[index],
            close: quotes.close[index],
            volume: quotes.volume[index]
        }));
        
        // Calculate 52-week high/low
        const highs = quotes.high.filter(h => h !== null);
        const lows = quotes.low.filter(l => l !== null);
        
        res.json({
            symbol: data.meta.symbol,
            period: '1y',
            interval: '1wk',
            cached: data.cached || false,
            fiftyTwoWeekHigh: Math.max(...highs),
            fiftyTwoWeekLow: Math.min(...lows),
            data: yearData
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 11. Comprehensive stock details
app.get('/api/stock/:symbol/details', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { nocache } = req.query;
        const useCache = nocache !== 'true';
        
        const data = await getSimpleStockData(symbol, 'summaryDetail,price,defaultKeyStatistics', useCache);
        const price = data.price;
        const summaryDetail = data.summaryDetail;
        const keyStats = data.defaultKeyStatistics;
        
        res.json({
            symbol: price.symbol,
            currentPrice: price.regularMarketPrice?.raw || 0,
            previousClose: price.regularMarketPreviousClose?.raw || 0,
            dayHigh: price.regularMarketDayHigh?.raw || 0,
            dayLow: price.regularMarketDayLow?.raw || 0,
            volume: price.regularMarketVolume?.raw || 0,
            fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh?.raw || 0,
            fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow?.raw || 0,
            marketCap: price.marketCap?.raw || 0,
            currency: price.currency,
            beta: keyStats.beta?.raw || 0,
            peRatio: summaryDetail.trailingPE?.raw || 0,
            eps: keyStats.trailingEps?.raw || 0,
            dividendYield: summaryDetail.dividendYield?.raw || 0,
            changePercent: price.regularMarketChangePercent?.raw || 0,
            change: price.regularMarketChange?.raw || 0,
            cached: false
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Database utility endpoints

// Search stocks
app.get('/api/search/:query', async (req, res) => {
    try {
        const { query } = req.params;
        const { limit = 10 } = req.query;
        
        const results = await db.searchStocks(query, parseInt(limit));
        res.json({ query, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get popular stocks - Fixed route with separate endpoints
app.get('/api/popular', async (req, res) => {
    try {
        const { category = 'nifty50', limit = 10 } = req.query;
        
        const results = await db.getPopularStocks(category, parseInt(limit));
        res.json({ category, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get popular stocks by category
app.get('/api/popular/:category', async (req, res) => {
    try {
        const { category } = req.params;
        const { limit = 10 } = req.query;
        
        const results = await db.getPopularStocks(category, parseInt(limit));
        res.json({ category, results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Clean expired cache
app.post('/api/cache/clean', async (req, res) => {
    try {
        const cleaned = await db.cleanExpiredCache();
        res.json({ 
            message: 'Cache cleaned successfully',
            entriesRemoved: cleaned 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enhanced health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        features: {
            caching: 'Enabled',
            database: 'SQLite',
            cacheTypes: ['quotes', 'historical_data', 'search_results']
        },
        endpoints: [
            'GET /api/simple/:symbol (RECOMMENDED)',
            'GET /api/stock/:symbol/quote',
            'GET /api/test/:symbol',
            'GET /api/stock/:symbol/1d',
            'GET /api/stock/:symbol/5d',
            'GET /api/stock/:symbol/1mo',
            'GET /api/stock/:symbol/3mo',
            'GET /api/stock/:symbol/1y',
            'GET /api/stock/:symbol/details',
            'POST /api/stocks/compare',
            'GET /api/search/:query',
            'GET /api/popular',
            'GET /api/popular/:category',
            'POST /api/cache/clean'
        ],
        notes: [
            'Use /api/simple/:symbol for most reliable results',
            'Add ?nocache=true to bypass cache',
            'Cache TTL: 5 minutes for quotes, 1 hour for historical data'
        ]
    });
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n📊 Shutting down gracefully...');
    db.close();
    process.exit(0);
});

// Auto-cleanup cache every hour
setInterval(async () => {
    try {
        await db.cleanExpiredCache();
    } catch (error) {
        console.error('Auto cleanup error:', error);
    }
}, 3600000); // 1 hour

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Stock API server running on port ${PORT}`);
    console.log(`💾 Database caching enabled`);
    console.log(`\n📊 USAGE EXAMPLES:`);
    console.log(`curl http://localhost:${PORT}/api/simple/RELIANCE`);
    console.log(`curl http://localhost:${PORT}/api/simple/RELIANCE?nocache=true`);
    console.log(`curl http://localhost:${PORT}/api/search/reliance`);
    console.log(`curl http://localhost:${PORT}/api/popular`);
    console.log(`curl http://localhost:${PORT}/api/popular/nifty50`);
    console.log(`\n🔥 For comparison:`);
    console.log(`curl -X POST http://localhost:${PORT}/api/stocks/compare -H "Content-Type: application/json" -d '{"symbols": ["RELIANCE", "TCS", "INFY"]}'`);
});