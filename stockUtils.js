const axios = require('axios');
const StockDatabase = require('./database/db');
const cheerio = require('cheerio');

// Initialize database
const db = new StockDatabase();

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

// Get enhanced quote with additional calculations
async function getEnhancedQuote(symbol, useCache = true) {
    const data = await getSimpleStockData(symbol, useCache);
    return {
        ...data,
        change: data.currentPrice - data.previousClose,
        changePercent: ((data.currentPrice - data.previousClose) / data.previousClose) * 100
    };
}

// Compare multiple stocks
async function compareStocks(symbols, useCache = true) {
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
    
    return stockData;
}

// Get intraday data (1-day, 1-minute intervals)
async function getIntradayData(symbol, useCache = true) {
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
    
    return {
        symbol: data.meta.symbol,
        period: '1d',
        interval: '1m',
        cached: data.cached || false,
        data: dayData
    };
}

// Get weekly data (5-day, 5-minute intervals)
async function getWeeklyData(symbol, useCache = true) {
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
    
    return {
        symbol: data.meta.symbol,
        period: '5d',
        interval: '5m',
        cached: data.cached || false,
        data: weekData
    };
}

// Get monthly data (1-month, daily intervals)
async function getMonthlyData(symbol, useCache = true) {
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
    
    return {
        symbol: data.meta.symbol,
        period: '1mo',
        interval: '1d',
        cached: data.cached || false,
        data: monthData
    };
}

// Get quarterly data (3-month, daily intervals)
async function getQuarterlyData(symbol, useCache = true) {
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
    
    return {
        symbol: data.meta.symbol,
        period: '3mo',
        interval: '1d',
        cached: data.cached || false,
        data: quarterData
    };
}

// Get yearly data (1-year, weekly intervals)
async function getYearlyData(symbol, useCache = true) {
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
    
    return {
        symbol: data.meta.symbol,
        period: '1y',
        interval: '1wk',
        cached: data.cached || false,
        fiftyTwoWeekHigh: Math.max(...highs),
        fiftyTwoWeekLow: Math.min(...lows),
        data: yearData
    };
}

// Get comprehensive stock details
async function getStockDetails(symbol, useCache = true) {
    const data = await getSimpleStockData(symbol, useCache);
    
    // For now, return enhanced basic data since the original detailed API isn't working
    return {
        symbol: data.symbol,
        currentPrice: data.currentPrice,
        previousClose: data.previousClose,
        dayHigh: data.dayHigh,
        dayLow: data.dayLow,
        volume: data.volume,
        currency: data.currency,
        exchangeName: data.exchangeName,
        change: data.currentPrice - data.previousClose,
        changePercent: ((data.currentPrice - data.previousClose) / data.previousClose) * 100,
        cached: data.cached,
        source: data.source
    };
}

// Enhanced online search function
async function searchOnlineStocks(query, limit = 10) {
    const results = [];
    
    // Try multiple search endpoints
    const searchEndpoints = [
        {
            name: 'Yahoo Finance Search',
            url: `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=${limit}&newsCount=0&enableFuzzyQuery=false&quotesQueryId=tss_match_phrase_query&multiQuoteQueryId=multi_quote_single_token_query`,
            parser: (data) => {
                if (data.quotes) {
                    return data.quotes.map(quote => ({
                        symbol: quote.symbol,
                        shortname: quote.shortname || quote.longname,
                        longname: quote.longname,
                        exchange: quote.exchange,
                        type: quote.quoteType,
                        score: quote.score || 1
                    }));
                }
                return [];
            }
        },
        {
            name: 'Yahoo Finance Autosuggest',
            url: `https://autoc.finance.yahoo.com/autoc?query=${encodeURIComponent(query)}&region=1&lang=en&callback=`,
            parser: (data) => {
                // Remove JSONP callback wrapper if present
                let jsonData = data;
                if (typeof data === 'string') {
                    const match = data.match(/\((.*)\)/);
                    if (match) {
                        jsonData = JSON.parse(match[1]);
                    }
                }
                
                if (jsonData.ResultSet && jsonData.ResultSet.Result) {
                    return jsonData.ResultSet.Result.map(result => ({
                        symbol: result.symbol,
                        shortname: result.name,
                        longname: result.name,
                        exchange: result.exchDisp,
                        type: result.typeDisp,
                        score: 1
                    }));
                }
                return [];
            }
        }
    ];
    
    // Try each search endpoint
    for (const endpoint of searchEndpoints) {
        try {
            console.log(`🔍 Searching ${endpoint.name} for: ${query}`);
            const response = await axiosInstance.get(endpoint.url);
            const searchResults = endpoint.parser(response.data);
            
            if (searchResults.length > 0) {
                results.push(...searchResults);
                console.log(`✅ Found ${searchResults.length} results from ${endpoint.name}`);
                break; // Use first successful search
            }
        } catch (error) {
            console.log(`❌ ${endpoint.name} search failed:`, error.message);
            continue;
        }
    }
    
    // Add manual mapping for common stocks
    const manualMappings = {
        'tesla': [{ symbol: 'TSLA', shortname: 'Tesla Inc', longname: 'Tesla, Inc.', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'airtel': [{ symbol: 'BHARTIARTL.NS', shortname: 'Bharti Airtel', longname: 'Bharti Airtel Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'reliance': [{ symbol: 'RELIANCE.NS', shortname: 'Reliance Industries', longname: 'Reliance Industries Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'tcs': [{ symbol: 'TCS.NS', shortname: 'Tata Consultancy Services', longname: 'Tata Consultancy Services Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'infy': [{ symbol: 'INFY.NS', shortname: 'Infosys Limited', longname: 'Infosys Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'infosys': [{ symbol: 'INFY.NS', shortname: 'Infosys Limited', longname: 'Infosys Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'apple': [{ symbol: 'AAPL', shortname: 'Apple Inc.', longname: 'Apple Inc.', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'microsoft': [{ symbol: 'MSFT', shortname: 'Microsoft Corporation', longname: 'Microsoft Corporation', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'google': [{ symbol: 'GOOGL', shortname: 'Alphabet Inc.', longname: 'Alphabet Inc. (Google)', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'amazon': [{ symbol: 'AMZN', shortname: 'Amazon.com Inc.', longname: 'Amazon.com, Inc.', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'meta': [{ symbol: 'META', shortname: 'Meta Platforms Inc.', longname: 'Meta Platforms, Inc.', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'facebook': [{ symbol: 'META', shortname: 'Meta Platforms Inc.', longname: 'Meta Platforms, Inc. (Facebook)', exchange: 'NASDAQ', type: 'EQUITY', score: 1 }],
        'hdfc': [{ symbol: 'HDFCBANK.NS', shortname: 'HDFC Bank Limited', longname: 'HDFC Bank Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'icici': [{ symbol: 'ICICIBANK.NS', shortname: 'ICICI Bank Limited', longname: 'ICICI Bank Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'sbi': [{ symbol: 'SBIN.NS', shortname: 'State Bank of India', longname: 'State Bank of India', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'wipro': [{ symbol: 'WIPRO.NS', shortname: 'Wipro Limited', longname: 'Wipro Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }],
        'adani': [{ symbol: 'ADANIPORTS.NS', shortname: 'Adani Ports and SEZ', longname: 'Adani Ports and Special Economic Zone Limited', exchange: 'NSI', type: 'EQUITY', score: 1 }]
    };
    
    // Check manual mappings if no results found
    if (results.length === 0) {
        const lowerQuery = query.toLowerCase();
        for (const [key, mapping] of Object.entries(manualMappings)) {
            if (key.includes(lowerQuery) || lowerQuery.includes(key)) {
                results.push(...mapping);
                console.log(`✅ Found manual mapping for: ${query} -> ${mapping[0].symbol}`);
                break;
            }
        }
    }
    
    // Remove duplicates and limit results
    const uniqueResults = results.filter((result, index, self) => 
        index === self.findIndex(r => r.symbol === result.symbol)
    );
    
    return uniqueResults.slice(0, limit);
}

// Search stocks function
async function searchStocks(query, limit = 10, online = true) {
    // First try local database
    let results = await db.searchStocks(query, parseInt(limit));
    console.log(`📊 Local DB found ${results.length} results for: ${query}`);
    
    // If no local results, check search cache
    if (results.length === 0) {
        const cachedSearch = await db.getCachedSearchResults(query);
        if (cachedSearch) {
            console.log(`📊 Search cache hit for: ${query}`);
            return {
                query,
                resultsCount: cachedSearch.count,
                source: `Cached ${cachedSearch.source}`,
                results: cachedSearch.results.slice(0, parseInt(limit))
            };
        }
    }
    
    // If no local results and online search is enabled, search online
    if (results.length === 0 && online) {
        console.log(`🌐 Searching online for: ${query}`);
        const onlineResults = await searchOnlineStocks(query, parseInt(limit));
        
        // Cache the online results for future searches
        if (onlineResults.length > 0) {
            try {
                await db.cacheSearchResults(query, onlineResults);
                console.log(`💾 Cached ${onlineResults.length} search results for: ${query}`);
            } catch (cacheError) {
                console.error('Search cache error:', cacheError);
            }
        }
        
        results = onlineResults.map(result => ({
            symbol: result.symbol,
            name: result.shortname || result.longname,
            long_name: result.longname,
            exchange: result.exchange,
            type: result.type || 'EQUITY',
            source: 'Online Search'
        }));
    }
    
    return { 
        query, 
        resultsCount: results.length,
        source: results.length > 0 && results[0].source === 'Online Search' ? 'Online' : 'Database',
        results 
    };
}

// Search and get quote in one call
async function searchAndQuote(query, useCache = true) {
    // First search for the stock
    let searchResults = await db.searchStocks(query, 1);
    
    if (searchResults.length === 0) {
        console.log(`🌐 Searching online for: ${query}`);
        const onlineResults = await searchOnlineStocks(query, 1);
        
        if (onlineResults.length > 0) {
            searchResults = [{
                symbol: onlineResults[0].symbol,
                name: onlineResults[0].shortname || onlineResults[0].longname,
                exchange: onlineResults[0].exchange
            }];
            
            // Cache the result
            try {
                await db.cacheSearchResults(query, onlineResults);
            } catch (cacheError) {
                console.error('Search cache error:', cacheError);
            }
        }
    }
    
    if (searchResults.length === 0) {
        throw new Error(`No stock found for query: ${query}`);
    }
    
    // Get the quote for the found symbol
    const stockSymbol = searchResults[0].symbol;
    const quoteData = await getSimpleStockData(stockSymbol, useCache);
    
    return {
        searchQuery: query,
        foundStock: searchResults[0],
        quote: {
            ...quoteData,
            change: quoteData.currentPrice - quoteData.previousClose,
            changePercent: ((quoteData.currentPrice - quoteData.previousClose) / quoteData.previousClose) * 100
        }
    };
}

// Get popular stocks
async function getPopularStocks(category = 'nifty50', limit = 10) {
    return await db.getPopularStocks(category, parseInt(limit));
}

// Cache management functions
async function cleanExpiredCache() {
    const quotesCleared = await db.cleanExpiredCache();
    const searchCleared = await db.cleanExpiredSearchCache();
    
    return {
        quoteCacheEntriesRemoved: quotesCleared,
        searchCacheEntriesRemoved: searchCleared,
        totalEntriesRemoved: quotesCleared + searchCleared
    };
}

// Close database connection
function closeDatabase() {
    return db.close();
}

// Auto-cleanup function (to be called periodically)
async function autoCleanup() {
    try {
        const quotesCleared = await db.cleanExpiredCache();
        const searchCleared = await db.cleanExpiredSearchCache();
        if (quotesCleared > 0 || searchCleared > 0) {
            console.log(`🧹 Auto cleanup: ${quotesCleared} quotes, ${searchCleared} search results`);
        }
        return { quotesCleared, searchCleared };
    } catch (error) {
        console.error('Auto cleanup error:', error);
        throw error;
    }
}

// Function to store trending stocks in database
async function storeTrendingStocks(trendingStocks) {
    try {
        // Check if trending stock methods exist, if not, just return success
        if (typeof db.clearTrendingStocks !== 'function') {
            console.log('⚠️ Trending stocks database methods not available, using in-memory storage');
            // Store in memory as fallback
            global.cachedTrendingStocks = {
                data: trendingStocks,
                timestamp: new Date().toISOString(),
                count: trendingStocks.length
            };
            return {
                success: true,
                count: trendingStocks.length,
                timestamp: new Date().toISOString(),
                storage: 'memory'
            };
        }
        
        // Clear existing trending stocks
        await db.clearTrendingStocks();
        
        // Store new trending stocks
        let storedCount = 0;
        for (const stock of trendingStocks) {
            try {
                await db.storeTrendingStock(stock);
                storedCount++;
            } catch (error) {
                console.error(`Error storing trending stock ${stock.symbol}:`, error.message);
            }
        }
        
        console.log(`💾 Stored ${storedCount} trending stocks in database`);
        return {
            success: true,
            count: storedCount,
            timestamp: new Date().toISOString(),
            storage: 'database'
        };
    } catch (error) {
        console.error('Error storing trending stocks:', error);
        // Fallback to memory storage
        global.cachedTrendingStocks = {
            data: trendingStocks,
            timestamp: new Date().toISOString(),
            count: trendingStocks.length
        };
        return {
            success: true,
            count: trendingStocks.length,
            timestamp: new Date().toISOString(),
            storage: 'memory-fallback'
        };
    }
}

// Function to get trending stocks from database
async function getTrendingStocks(limit = 30) {
    try {
        // Check if trending stock methods exist
        if (typeof db.getTrendingStocks !== 'function') {
            console.log('⚠️ Trending stocks database methods not available, checking memory...');
            
            // Check memory cache first
            if (global.cachedTrendingStocks) {
                const cacheAge = new Date() - new Date(global.cachedTrendingStocks.timestamp);
                const cacheHours = cacheAge / (1000 * 60 * 60);
                
                // Use cache if less than 2 hours old
                if (cacheHours < 2) {
                    console.log(`📊 Using memory cached trending stocks (${cacheHours.toFixed(1)}h old)`);
                    return {
                        success: true,
                        count: Math.min(global.cachedTrendingStocks.data.length, limit),
                        source: 'Memory Cache',
                        lastUpdated: global.cachedTrendingStocks.timestamp,
                        data: global.cachedTrendingStocks.data.slice(0, limit)
                    };
                }
            }
            
            // Generate fallback and store in memory
            console.log('🔄 Generating fresh fallback trending stocks...');
            const fallbackStocks = await getFallbackTrendingStocks();
            
            global.cachedTrendingStocks = {
                data: fallbackStocks,
                timestamp: new Date().toISOString(),
                count: fallbackStocks.length
            };
            
            return {
                success: true,
                count: Math.min(fallbackStocks.length, limit),
                source: 'Generated Fallback',
                lastUpdated: new Date().toISOString(),
                data: fallbackStocks.slice(0, limit)
            };
        }
        
        const trendingStocks = await db.getTrendingStocks(limit);
        
        if (trendingStocks.length === 0) {
            console.log('No trending stocks found in database, generating fallback...');
            const fallbackStocks = await getFallbackTrendingStocks();
            
            // Store the fallback stocks for future use
            await storeTrendingStocks(fallbackStocks);
            
            return {
                success: true,
                count: Math.min(fallbackStocks.length, limit),
                source: 'Fallback Generated',
                lastUpdated: new Date().toISOString(),
                data: fallbackStocks.slice(0, limit)
            };
        }
        
        return {
            success: true,
            count: trendingStocks.length,
            source: 'Database',
            lastUpdated: trendingStocks[0]?.lastUpdated || new Date().toISOString(),
            data: trendingStocks
        };
    } catch (error) {
        console.error('Error getting trending stocks:', error);
        
        // Fallback to memory cache if available
        if (global.cachedTrendingStocks) {
            console.log('📊 Using memory cache due to database error...');
            return {
                success: true,
                count: Math.min(global.cachedTrendingStocks.data.length, limit),
                source: 'Memory Cache (Error Fallback)',
                lastUpdated: global.cachedTrendingStocks.timestamp,
                data: global.cachedTrendingStocks.data.slice(0, limit)
            };
        }
        
        // Generate fresh fallback
        const fallbackStocks = await getFallbackTrendingStocks();
        
        global.cachedTrendingStocks = {
            data: fallbackStocks,
            timestamp: new Date().toISOString(),
            count: fallbackStocks.length
        };
        
        return {
            success: true,
            count: Math.min(fallbackStocks.length, limit),
            source: 'Generated Fallback (Error Recovery)',
            lastUpdated: new Date().toISOString(),
            data: fallbackStocks.slice(0, limit)
        };
    }
}

// Function to check if trending stocks should be updated
async function shouldUpdateTrendingStocks() {
    try {
        // Check if method exists
        if (typeof db.getLastTrendingStocksUpdate !== 'function') {
            // Check memory cache age
            if (global.cachedTrendingStocks) {
                const cacheAge = new Date() - new Date(global.cachedTrendingStocks.timestamp);
                const cacheHours = cacheAge / (1000 * 60 * 60);
                const shouldUpdate = cacheHours > 2; // Update if more than 2 hours old
                
                console.log(`Memory cache age: ${cacheHours.toFixed(2)} hours, should update: ${shouldUpdate}`);
                return shouldUpdate;
            }
            
            console.log('No memory cache found, should update: true');
            return true;
        }
        
        const lastUpdate = await db.getLastTrendingStocksUpdate();
        
        if (!lastUpdate) {
            console.log('No previous trending stocks update found');
            return true;
        }
        
        const now = new Date();
        const lastUpdateTime = new Date(lastUpdate);
        const timeDifference = now - lastUpdateTime;
        const hoursDifference = timeDifference / (1000 * 60 * 60);
        
        // Update if more than 2 hours have passed
        const shouldUpdate = hoursDifference > 2;
        
        console.log(`Last trending stocks update: ${lastUpdateTime.toISOString()}`);
        console.log(`Hours since last update: ${hoursDifference.toFixed(2)}`);
        console.log(`Should update: ${shouldUpdate}`);
        
        return shouldUpdate;
    } catch (error) {
        console.error('Error checking trending stocks update status:', error);
        return true; // Default to update if there's an error
    }
}

// Update the main scraping function call to always return data
async function updateTrendingStocks() {
    try {
        console.log('🔄 Updating trending stocks...');
        
        // Scrape trending stocks (with fallback built-in)
        const scrapedStocks = await scrapeTrendingStocks();
        
        if (scrapedStocks.length === 0) {
            // This should not happen with fallback, but just in case
            throw new Error('No trending stocks found even with fallback');
        }
        
        // Store in database
        const result = await storeTrendingStocks(scrapedStocks);
        
        console.log(`✅ Successfully updated ${result.count} trending stocks`);
        return result;
        
    } catch (error) {
        console.error('❌ Error updating trending stocks:', error.message);
        throw error;
    }
}

// Enhanced scraping function with fallback
async function scrapeTrendingStocks() {
    console.log('🔍 Attempting to scrape trending stocks from multiple sources...');
    
    // Try multiple sources with different strategies
    const sources = [
        {
            name: 'Yahoo Finance Most Active (US)',
            url: 'https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?formatted=true&lang=en-US&region=US&scrIds=most_actives',
            parser: parseYahooMostActiveUS
        },
        {
            name: 'Yahoo Finance Most Active (India)',
            url: 'https://query1.finance.yahoo.com/v1/finance/screener?crumb=&lang=en-US&region=US&formatted=true&corsDomain=finance.yahoo.com',
            parser: parseYahooMostActiveIndia
        },
        {
            name: 'NSE Most Active (Alternative)',
            url: 'https://www.nseindia.com/api/live-analysis-most-active-securities',
            parser: parseNSEMostActiveAlt
        }
    ];

    for (const source of sources) {
        try {
            console.log(`🔍 Trying ${source.name}...`);
            const stocks = await source.parser(source.url);
            
            if (stocks.length > 0) {
                console.log(`✅ Successfully got ${stocks.length} trending stocks from ${source.name}`);
                return stocks;
            }
        } catch (error) {
            console.log(`❌ ${source.name} failed: ${error.message}`);
            continue;
        }
    }
    
    console.log('⚠️ All scraping sources failed, using fallback trending stocks...');
    return await getFallbackTrendingStocks();
}

// New parser for Yahoo Finance US (includes global stocks)
async function parseYahooMostActiveUS(url) {
    const response = await axiosInstance.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Referer': 'https://finance.yahoo.com/',
            'Origin': 'https://finance.yahoo.com'
        },
        timeout: 10000
    });

    const data = response.data;
    const stocks = [];
    let rank = 1;

    if (data.finance?.result?.[0]?.quotes) {
        for (const quote of data.finance.result[0].quotes) {
            // Focus on Indian stocks (.NS suffix) and popular US stocks
            if (quote.symbol?.endsWith('.NS') || 
                ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'AMZN', 'META', 'NVDA'].includes(quote.symbol)) {
                
                const changeAmount = quote.regularMarketChange || 0;
                const changePercent = quote.regularMarketChangePercent || 0;
                const symbol = quote.symbol.replace('.NS', '');
                
                stocks.push({
                    symbol: symbol,
                    companyName: quote.shortName || quote.longName || symbol,
                    lastPrice: quote.regularMarketPrice,
                    dayHigh: quote.regularMarketDayHigh,
                    dayLow: quote.regularMarketDayLow,
                    changeAmount: changeAmount,
                    changePercent: changePercent,
                    volume: quote.regularMarketVolume?.toString() || '0',
                    lastUpdatedTime: new Date().toTimeString().split(' ')[0],
                    marketStatus: 'open',
                    trendRank: rank,
                    isPositiveChange: changeAmount > 0
                });
                rank++;
                
                if (stocks.length >= 30) break;
            }
        }
    }

    return stocks;
}

// Alternative parser for Indian stocks
async function parseYahooMostActiveIndia(url) {
    // Create a custom request for Indian market data
    const indianStocksUrl = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + 
        'RELIANCE.NS,TCS.NS,HDFCBANK.NS,INFY.NS,HINDUNILVR.NS,ICICIBANK.NS,KOTAKBANK.NS,BHARTIARTL.NS,SBIN.NS,LT.NS';
    
    const response = await axiosInstance.get(indianStocksUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://finance.yahoo.com/'
        },
        timeout: 10000
    });

    const data = response.data;
    const stocks = [];
    let rank = 1;

    if (data.quoteResponse?.result) {
        for (const quote of data.quoteResponse.result) {
            const changeAmount = quote.regularMarketChange || 0;
            const changePercent = quote.regularMarketChangePercent || 0;
            const symbol = quote.symbol.replace('.NS', '');
            
            stocks.push({
                symbol: symbol,
                companyName: quote.shortName || quote.longName || symbol,
                lastPrice: quote.regularMarketPrice,
                dayHigh: quote.regularMarketDayHigh,
                dayLow: quote.regularMarketDayLow,
                changeAmount: changeAmount,
                changePercent: changePercent,
                volume: quote.regularMarketVolume?.toString() || '0',
                lastUpdatedTime: new Date().toTimeString().split(' ')[0],
                marketStatus: 'open',
                trendRank: rank,
                isPositiveChange: changeAmount > 0
            });
            rank++;
        }
    }

    return stocks;
}

// Alternative NSE parser
async function parseNSEMostActiveAlt(url) {
    const response = await axiosInstance.get(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.nseindia.com/',
            'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 15000
    });

    const data = response.data;
    const stocks = [];
    let rank = 1;

    // Try different data structures that NSE might use
    const dataArrays = [data.VOLUME, data.data, data.mostActive, data];
    
    for (const dataArray of dataArrays) {
        if (Array.isArray(dataArray) && dataArray.length > 0) {
            for (const stock of dataArray.slice(0, 30)) {
                const changeAmount = parseFloat(stock.netPrice || stock.change || stock.changeAmount) || 0;
                const changePercent = parseFloat(stock.pChange || stock.changePercent || stock.pctChange) || 0;
                
                stocks.push({
                    symbol: stock.symbol || stock.Symbol || stock.scrip,
                    companyName: stock.companyName || stock.name || stock.symbol,
                    lastPrice: parseFloat(stock.lastPrice || stock.ltp || stock.price),
                    dayHigh: parseFloat(stock.dayHigh || stock.high),
                    dayLow: parseFloat(stock.dayLow || stock.low),
                    changeAmount: changeAmount,
                    changePercent: changePercent,
                    volume: (stock.totalTradedVolume || stock.volume || '0').toString(),
                    lastUpdatedTime: new Date().toTimeString().split(' ')[0],
                    marketStatus: 'open',
                    trendRank: rank,
                    isPositiveChange: changeAmount > 0
                });
                rank++;
            }
            break; // Use first successful data array
        }
    }

    return stocks;
}

// Helper function to parse volume (converts "8.64M" to number)
function parseVolume(volumeStr) {
    if (!volumeStr) return null;
    
    const cleanStr = volumeStr.replace(/,/g, '');
    const multipliers = {
        'K': 1000,
        'M': 1000000,
        'B': 1000000000
    };
    
    const match = cleanStr.match(/^([\d.]+)([KMB])?$/);
    if (!match) return null;
    
    const number = parseFloat(match[1]);
    const suffix = match[2];
    
    return suffix ? number * multipliers[suffix] : number;
}

// Helper function to parse price (removes commas)
function parsePrice(priceStr) {
    if (!priceStr) return null;
    return parseFloat(priceStr.replace(/,/g, ''));
}

// Helper function to parse change amount and percentage
function parseChange(changeStr) {
    if (!changeStr) return { amount: null, isPositive: false };
    
    const isPositive = changeStr.startsWith('+');
    const cleanStr = changeStr.replace(/[+\-,]/g, '');
    const amount = parseFloat(cleanStr);
    
    return { amount: isNaN(amount) ? null : amount, isPositive };
}

// Fallback trending stocks based on popular Indian stocks
async function getFallbackTrendingStocks() {
    console.log('🔄 Generating fallback trending stocks from popular stocks...');
    
    const popularSymbols = [
        'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'HINDUNILVR',
        'ICICIBANK', 'KOTAKBANK', 'BHARTIARTL', 'SBIN', 'LT',
        'ITC', 'AXISBANK', 'ASIANPAINT', 'MARUTI', 'TITAN',
        'BAJFINANCE', 'HCLTECH', 'WIPRO', 'ULTRACEMCO', 'NESTLEIND',
        'POWERGRID', 'NTPC', 'TECHM', 'SUNPHARMA', 'TATASTEEL',
        'ONGC', 'COALINDIA', 'DIVISLAB', 'DRREDDY', 'CIPLA',
        'BAJAJFINSV', 'ADANIPORTS', 'JSWSTEEL', 'HINDALCO', 'GRASIM',
        'HEROMOTOCO', 'BRITANNIA', 'BAJAJ-AUTO', 'APOLLOHOSP', 'SHREECEM'
    ];

    const stocks = [];
    let rank = 1;

    for (const symbol of popularSymbols) {
        try {
            const quote = await getSimpleStockData(symbol, true);
            const changeAmount = quote.currentPrice - quote.previousClose;
            const changePercent = (changeAmount / quote.previousClose) * 100;

            // Create company name from symbol (better formatting)
            let companyName = symbol;
            const companyNames = {
                'RELIANCE': 'Reliance Industries Limited',
                'TCS': 'Tata Consultancy Services Limited',
                'HDFCBANK': 'HDFC Bank Limited',
                'INFY': 'Infosys Limited',
                'HINDUNILVR': 'Hindustan Unilever Limited',
                'ICICIBANK': 'ICICI Bank Limited',
                'KOTAKBANK': 'Kotak Mahindra Bank Limited',
                'BHARTIARTL': 'Bharti Airtel Limited',
                'SBIN': 'State Bank of India',
                'LT': 'Larsen & Toubro Limited',
                'ITC': 'ITC Limited',
                'AXISBANK': 'Axis Bank Limited',
                'ASIANPAINT': 'Asian Paints Limited',
                'MARUTI': 'Maruti Suzuki India Limited',
                'TITAN': 'Titan Company Limited',
                'BAJFINANCE': 'Bajaj Finance Limited',
                'HCLTECH': 'HCL Technologies Limited',
                'WIPRO': 'Wipro Limited',
                'ULTRACEMCO': 'UltraTech Cement Limited',
                'NESTLEIND': 'Nestle India Limited',
                'POWERGRID': 'Power Grid Corporation of India Limited',
                'NTPC': 'NTPC Limited',
                'TECHM': 'Tech Mahindra Limited',
                'SUNPHARMA': 'Sun Pharmaceutical Industries Limited',
                'TATASTEEL': 'Tata Steel Limited',
                'ONGC': 'Oil and Natural Gas Corporation Limited',
                'COALINDIA': 'Coal India Limited',
                'DIVISLAB': 'Divi\'s Laboratories Limited',
                'DRREDDY': 'Dr. Reddy\'s Laboratories Limited',
                'CIPLA': 'Cipla Limited',
                'BAJAJFINSV': 'Bajaj Finserv Limited',
                'ADANIPORTS': 'Adani Ports and Special Economic Zone Limited',
                'JSWSTEEL': 'JSW Steel Limited',
                'HINDALCO': 'Hindalco Industries Limited',
                'GRASIM': 'Grasim Industries Limited',
                'HEROMOTOCO': 'Hero MotoCorp Limited',
                'BRITANNIA': 'Britannia Industries Limited',
                'BAJAJ-AUTO': 'Bajaj Auto Limited',
                'APOLLOHOSP': 'Apollo Hospitals Enterprise Limited',
                'SHREECEM': 'Shree Cement Limited'
            };

            companyName = companyNames[symbol] || symbol;

            stocks.push({
                symbol: symbol,
                companyName: companyName,
                lastPrice: quote.currentPrice,
                dayHigh: quote.dayHigh,
                dayLow: quote.dayLow,
                changeAmount: changeAmount,
                changePercent: changePercent,
                volume: quote.volume?.toString() || '0',
                lastUpdatedTime: new Date().toTimeString().split(' ')[0],
                marketStatus: 'open',
                trendRank: rank,
                isPositiveChange: changeAmount > 0
            });
            rank++;

            // Add small delay to avoid overwhelming the API
            await new Promise(resolve => setTimeout(resolve, 50));

            // Stop at 30 stocks
            if (stocks.length >= 30) break;

        } catch (error) {
            console.log(`⚠️ Failed to get data for ${symbol}: ${error.message}`);
            continue;
        }
    }

    // Sort by absolute change percentage to make it more "trending"
    stocks.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));
    
    // Re-assign ranks after sorting
    stocks.forEach((stock, index) => {
        stock.trendRank = index + 1;
    });

    console.log(`✅ Generated ${stocks.length} fallback trending stocks`);
    return stocks;
}

// Update the main scraping function call to always return data
async function updateTrendingStocks() {
    try {
        console.log('🔄 Updating trending stocks...');
        
        // Scrape trending stocks (with fallback built-in)
        const scrapedStocks = await scrapeTrendingStocks();
        
        if (scrapedStocks.length === 0) {
            // This should not happen with fallback, but just in case
            throw new Error('No trending stocks found even with fallback');
        }
        
        // Store in database
        const result = await storeTrendingStocks(scrapedStocks);
        
        console.log(`✅ Successfully updated ${result.count} trending stocks`);
        return result;
        
    } catch (error) {
        console.error('❌ Error updating trending stocks:', error.message);
        throw error;
    }
}

module.exports = {
    // Core stock data functions
    getSimpleStockData,
    getHistoricalData,
    getEnhancedQuote,
    getStockDetails,
    getNSEData,
    
    // Time-based data functions
    getIntradayData,
    getWeeklyData,
    getMonthlyData,
    getQuarterlyData,
    getYearlyData,
    
    // Comparison and analysis
    compareStocks,
    
    // Search functions
    searchStocks,
    searchOnlineStocks,
    searchAndQuote,
    
    // Popular stocks
    getPopularStocks,
    
    // Cache management
    cleanExpiredCache,
    autoCleanup,
    
    // Database management
    closeDatabase,
    
    // Direct database access (if needed)
    db,
    
    // Trending stocks functions
    scrapeTrendingStocks,
    storeTrendingStocks,
    getTrendingStocks,
    updateTrendingStocks,
    shouldUpdateTrendingStocks,
    
    // Helper functions
    parseVolume,
    parsePrice,
    parseChange
};