const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class StockDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'stock_cache.db');
        this.db = null;
        this.isInitialized = false;
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening database:', err);
                    reject(err);
                } else {
                    console.log('📊 Connected to SQLite database');
                    this.createTables().then(() => {
                        this.isInitialized = true;
                        resolve();
                    }).catch(reject);
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
        await this.init(); // Ensure database is initialized
        
        const sql = `
            INSERT OR REPLACE INTO quotes 
            (symbol, current_price, previous_close, day_high, day_low, volume, 
             change_amount, change_percent, market_state, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        const change = quoteData.currentPrice - quoteData.previousClose;
        const changePercent = (change / quoteData.previousClose) * 100;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.run([
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
                stmt.finalize(); // Always finalize the statement
                
                if (err) {
                    reject(err);
                } else {
                    // Update cache metadata without binding 'this'
                    resolve(this.lastID);
                }
            });
        });
    }

    // Get cached quote
    async getCachedQuote(symbol, maxAgeMinutes = 5) {
        await this.init();
        
        const sql = `
            SELECT * FROM quotes 
            WHERE symbol = ? 
            AND last_updated > datetime('now', '-${maxAgeMinutes} minutes')
            ORDER BY last_updated DESC 
            LIMIT 1
        `;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.get([symbol], (err, row) => {
                stmt.finalize(); // Always finalize
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    // Cache historical data
    async cacheHistoricalData(symbol, period, interval, historicalData) {
        await this.init();
        
        const sql = `
            INSERT OR REPLACE INTO historical_data 
            (symbol, date, period, interval_type, open_price, high_price, 
             low_price, close_price, volume, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        return new Promise((resolve, reject) => {
            this.db.serialize(() => {
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
                
                stmt.finalize((err) => {
                    if (err) {
                        reject(err);
                    } else {
                        this.updateCacheMetadata(symbol, 'historical', period, 3600)
                            .then(() => resolve())
                            .catch(reject);
                    }
                });
            });
        });
    }

    // Get cached historical data
    async getCachedHistoricalData(symbol, period, maxAgeHours = 1) {
        await this.init();
        
        const sql = `
            SELECT * FROM historical_data 
            WHERE symbol = ? AND period = ?
            AND created_at > datetime('now', '-${maxAgeHours} hours')
            ORDER BY date ASC
        `;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.all([symbol, period], (err, rows) => {
                stmt.finalize();
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Update cache metadata
    async updateCacheMetadata(symbol, dataType, period, ttlSeconds) {
        await this.init();
        
        const cacheKey = `${symbol}_${dataType}_${period || 'default'}`;
        const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
        
        const sql = `
            INSERT OR REPLACE INTO cache_metadata 
            (cache_key, symbol, data_type, period, last_fetched, expires_at, hit_count)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 
                    COALESCE((SELECT hit_count FROM cache_metadata WHERE cache_key = ?), 0) + 1)
        `;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.run([cacheKey, symbol, dataType, period, expiresAt.toISOString(), cacheKey], 
                function(err) {
                    stmt.finalize();
                    if (err) reject(err);
                    else resolve(this.changes);
                });
        });
    }

    // Search stocks
    async searchStocks(query, limit = 10) {
        await this.init();
        
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
            const stmt = this.db.prepare(sql);
            stmt.all([searchTerm, searchTerm, searchTerm, query.toUpperCase(), 
                     `${query.toUpperCase()}%`, `${query.toUpperCase()}%`, limit], 
                (err, rows) => {
                    stmt.finalize();
                    if (err) reject(err);
                    else resolve(rows);
                });
        });
    }

    // Get popular stocks
    async getPopularStocks(category = 'nifty50', limit = 10) {
        await this.init();
        
        const sql = `
            SELECT s.symbol, s.company_name, ps.rank_position
            FROM popular_stocks ps
            JOIN stocks s ON ps.symbol = s.symbol
            WHERE ps.category = ?
            ORDER BY ps.rank_position ASC
            LIMIT ?
        `;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.all([category, limit], (err, rows) => {
                stmt.finalize();
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    // Cache search results
    async cacheSearchResults(query, results) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO search_cache (query, results, result_count, source, expires_at)
                VALUES (?, ?, ?, ?, datetime('now', '+1 hour'))
            `);
            
            stmt.run([
                query.toLowerCase(), 
                JSON.stringify(results), 
                results.length,
                'online'
            ], function(err) {
                stmt.finalize();
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    // Get cached search results
    async getCachedSearchResults(query, maxAgeMinutes = 60) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                SELECT results, result_count, source FROM search_cache 
                WHERE query = ? AND expires_at > datetime('now')
            `);
            
            stmt.get([query.toLowerCase()], (err, row) => {
                stmt.finalize();
                if (err) {
                    reject(err);
                } else {
                    const result = row ? {
                        results: JSON.parse(row.results),
                        count: row.result_count,
                        source: row.source
                    } : null;
                    resolve(result);
                }
            });
        });
    }

    // Clean expired search cache
    async cleanExpiredSearchCache() {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                DELETE FROM search_cache WHERE expires_at < datetime('now')
            `);
            
            stmt.run([], function(err) {
                stmt.finalize();
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    // Clean expired cache
    async cleanExpiredCache() {
        await this.init();
        
        const sql = `
            DELETE FROM cache_metadata 
            WHERE expires_at < datetime('now')
        `;
        
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(sql);
            stmt.run([], function(err) {
                stmt.finalize();
                if (err) {
                    reject(err);
                } else {
                    console.log(`🧹 Cleaned ${this.changes} expired cache entries`);
                    resolve(this.changes);
                }
            });
        });
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                // Close the database connection
                this.db.close((err) => {
                    if (err) {
                        console.error('Error closing database:', err);
                    } else {
                        console.log('📊 Database connection closed');
                    }
                    this.isInitialized = false;
                    resolve();
                });
            });
        }
    }
}

module.exports = StockDatabase;