-- 1. Stocks Master Table (Basic Stock Information)
CREATE TABLE IF NOT EXISTS stocks (
    symbol VARCHAR(20) PRIMARY KEY,
    company_name VARCHAR(255),
    sector VARCHAR(100),
    industry VARCHAR(100),
    market_cap BIGINT,
    exchange VARCHAR(10) DEFAULT 'NSE',
    currency VARCHAR(5) DEFAULT 'INR',
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Real-time Quotes (Current Price Data)
CREATE TABLE IF NOT EXISTS quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20),
    current_price DECIMAL(10,2),
    previous_close DECIMAL(10,2),
    day_high DECIMAL(10,2),
    day_low DECIMAL(10,2),
    volume BIGINT,
    change_amount DECIMAL(10,2),
    change_percent DECIMAL(5,2),
    market_state VARCHAR(20),
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol) REFERENCES stocks(symbol)
);

-- 3. Historical Price Data (OHLCV)
CREATE TABLE IF NOT EXISTS historical_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20),
    date DATE,
    period VARCHAR(10), -- '1d', '5d', '1mo', '3mo', '1y'
    interval_type VARCHAR(10), -- '1m', '5m', '1d', '1wk'
    open_price DECIMAL(10,2),
    high_price DECIMAL(10,2),
    low_price DECIMAL(10,2),
    close_price DECIMAL(10,2),
    volume BIGINT,
    timestamp BIGINT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol) REFERENCES stocks(symbol)
);

-- 4. Stock Fundamentals (52-week high/low, P/E, etc.)
CREATE TABLE IF NOT EXISTS fundamentals (
    symbol VARCHAR(20) PRIMARY KEY,
    fifty_two_week_high DECIMAL(10,2),
    fifty_two_week_low DECIMAL(10,2),
    pe_ratio DECIMAL(8,2),
    eps DECIMAL(8,2),
    dividend_yield DECIMAL(5,2),
    beta DECIMAL(5,2),
    book_value DECIMAL(10,2),
    price_to_book DECIMAL(5,2),
    debt_to_equity DECIMAL(5,2),
    roe DECIMAL(5,2), -- Return on Equity
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol) REFERENCES stocks(symbol)
);

-- 5. Cache Metadata (Track cache freshness)
CREATE TABLE IF NOT EXISTS cache_metadata (
    cache_key VARCHAR(255) PRIMARY KEY,
    symbol VARCHAR(20),
    data_type VARCHAR(50), -- 'quote', 'historical', 'fundamentals'
    period VARCHAR(10),
    last_fetched DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    hit_count INTEGER DEFAULT 0
);

-- 6. Popular Stocks (For quick access)
CREATE TABLE IF NOT EXISTS popular_stocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20),
    category VARCHAR(50), -- 'nifty50', 'sensex', 'trending'
    rank_position INTEGER,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (symbol) REFERENCES stocks(symbol)
);

-- 7. Search Index (For fast stock search)
CREATE TABLE IF NOT EXISTS search_index (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol VARCHAR(20),
    company_name VARCHAR(255),
    search_terms TEXT, -- Combined searchable text
    popularity_score INTEGER DEFAULT 0,
    FOREIGN KEY (symbol) REFERENCES stocks(symbol)
);

-- 8. Search Cache (Online search results cache)
CREATE TABLE IF NOT EXISTS search_cache (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    query VARCHAR(255) UNIQUE NOT NULL,
    results TEXT NOT NULL, -- JSON array of search results
    result_count INTEGER DEFAULT 0,
    source VARCHAR(50) DEFAULT 'online', -- 'online', 'manual'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME DEFAULT (datetime('now', '+1 hour'))
);

-- Create indexes for better performance (separate statements)
CREATE INDEX IF NOT EXISTS idx_quotes_symbol_time ON quotes(symbol, last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_historical_symbol_period ON historical_data(symbol, period, date DESC);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_metadata(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_terms ON search_index(search_terms);
CREATE INDEX IF NOT EXISTS idx_symbol_type ON cache_metadata(symbol, data_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_historical_unique ON historical_data(symbol, date, period, interval_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_popular_unique ON popular_stocks(symbol, category);

-- New indexes for search cache
CREATE INDEX IF NOT EXISTS idx_search_cache_query ON search_cache(query);
CREATE INDEX IF NOT EXISTS idx_search_cache_expires ON search_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_search_cache_source ON search_cache(source);
