const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class StockDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'stock_cache.db');
        this.db = null;
        this.init();
    }

    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('📊 Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        return new Promise((resolve, reject) => {
            this.db.exec(schema, (err) => {
                if (err) {
                    console.error('Error creating tables:', err);
                    reject(err);
                } else {
                    console.log('✅ Database tables created/verified');
                    resolve();
                }
            });
        });
    }

    // Cache quote data
    async cacheQuote(symbol, quoteData) {
        const sql = `
            INSERT OR REPLACE INTO quotes 
            (symbol, current_price, previous_close, day_high, day_low, volume, 
             change_amount, change_percent, market_state, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        const change = quoteData.currentPrice - quoteData.previousClose;
        const changePercent = (change / quoteData.previousClose) * 100;
        
        return new Promise((resolve, reject) => {
            this.db.run(sql, [
                symbol,
                quoteData.currentPrice,
                quoteData.previousClose,
                quoteData.dayHigh,
                quoteData.dayLow,
                quoteData.volume,
                change,
                changePercent,
                'REGULAR'
            ], function(err) {
                if (err) reject(err);
                else {
                    // Update cache metadata
                    this.updateCacheMetadata(symbol, 'quote', null, 300); // 5 min cache
                    resolve(this.lastID);
                }
            }.bind(this));
        });
    }

    // Get cached quote
    async getCachedQuote(symbol, maxAgeMinutes = 5) {
        const sql = `
            SELECT * FROM quotes 
            WHERE symbol = ? 
            AND last_updated > datetime('now', '-${maxAgeMinutes} minutes')
            ORDER BY last_updated DESC 
            LIMIT 1
        `;
        
        return new Promise((resolve, reject) => {
            this.db.get(sql, [symbol], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Cache historical data
    async cacheHistoricalData(symbol, period, interval, historicalData) {
        const sql = `
            INSERT OR REPLACE INTO historical_data 
            (symbol, date, period, interval_type, open_price, high_price, 
             low_price, close_price, volume, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const stmt = this.db.prepare(sql);
        
        for (const dataPoint of historicalData) {
            stmt.run([
                symbol,
                dataPoint.date || dataPoint.time.split('T')[0],
                period,
                interval,
                dataPoint.open,
                dataPoint.high,
                dataPoint.low,
                dataPoint.close,
                dataPoint.volume,
                new Date(dataPoint.time || dataPoint.date).getTime()
            ]);
        }
        
        stmt.finalize();
        this.updateCacheMetadata(symbol, 'historical', period, 3600); // 1 hour cache
    }

    // Get cached historical data
    async getCachedHistoricalData(symbol, period, maxAgeHours = 1) {
        const sql = `
            SELECT * FROM historical_data 
            WHERE symbol = ? AND period = ?
            AND created_at > datetime('now', '-${maxAgeHours} hours')
            ORDER BY date ASC
        `;
        
        return new Promise((resolve, reject) => {
            this.db.all(sql, [symbol, period], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Update cache metadata
    async updateCacheMetadata(symbol, dataType, period, ttlSeconds) {
        const cacheKey = `${symbol}_${dataType}_${period || 'default'}`;
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        
        const sql = `
            INSERT OR REPLACE INTO cache_metadata 
            (cache_key, symbol, data_type, period, last_fetched, expires_at, hit_count)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 
                    COALESCE((SELECT hit_count FROM cache_metadata WHERE cache_key = ?), 0) + 1)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(sql, [cacheKey, symbol, dataType, period, expiresAt.toISOString(), cacheKey], 
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                });
        });
    }

    // Search stocks
    async searchStocks(query, limit = 10) {
        const sql = `
            SELECT s.symbol, s.company_name, s.sector, s.industry 
            FROM stocks s
            LEFT JOIN search_index si ON s.symbol = si.symbol
            WHERE s.symbol LIKE ? OR s.company_name LIKE ? OR si.search_terms LIKE ?
            ORDER BY 
                CASE 
                    WHEN s.symbol = ? THEN 1
                    WHEN s.symbol LIKE ? THEN 2
                    WHEN s.company_name LIKE ? THEN 3
                    ELSE 4
                END,
                si.popularity_score DESC
            LIMIT ?
        `;
        
        const searchTerm = `%${query.toUpperCase()}%`;
        
        return new Promise((resolve, reject) => {
            this.db.all(sql, [searchTerm, searchTerm, searchTerm, query.toUpperCase(), 
                             `${query.toUpperCase()}%`, `${query.toUpperCase()}%`, limit], 
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                });
        });
    }

    // Get popular stocks
    async getPopularStocks(category = 'nifty50', limit = 10) {
        const sql = `
            SELECT s.symbol, s.company_name, ps.rank_position
            FROM popular_stocks ps
            JOIN stocks s ON ps.symbol = s.symbol
            WHERE ps.category = ?
            ORDER BY ps.rank_position ASC
            LIMIT ?
        `;
        
        return new Promise((resolve, reject) => {
            this.db.all(sql, [category, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Clean expired cache
    async cleanExpiredCache() {
        const sql = `
            DELETE FROM cache_metadata 
            WHERE expires_at < datetime('now')
        `;
        
        return new Promise((resolve, reject) => {
            this.db.run(sql, function(err) {
                if (err) reject(err);
                else {
                    console.log(`🧹 Cleaned ${this.changes} expired cache entries`);
                    resolve(this.changes);
                }
            });
        });
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) console.error('Error closing database:', err);
                else console.log('📊 Database connection closed');
            });
        }
    }
}

module.exports = StockDatabase;