const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class UserStockDatabase {
    constructor() {
        this.dbPath = path.join(__dirname, 'user_data.db');
        this.isInitialized = false;
        this.init();
    }

    async init() {
        if (this.isInitialized) return;
        
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('Error opening user database:', err);
                    reject(err);
                } else {
                    console.log('👤 Connected to User SQLite database');
                    this.createTables().then(() => {
                        this.isInitialized = true;
                        resolve();
                    }).catch(reject);
                }
                db.close();
            });
        });
    }

    getConnection() {
        return new sqlite3.Database(this.dbPath);
    }

    async createTables() {
        const schema = `
-- User Wallets
CREATE TABLE IF NOT EXISTS user_wallets (
    user_id INTEGER PRIMARY KEY,
    balance DECIMAL(15,2) DEFAULT 0.00,
    total_invested DECIMAL(15,2) DEFAULT 0.00,
    total_current_value DECIMAL(15,2) DEFAULT 0.00,
    total_profit_loss DECIMAL(15,2) DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Portfolio Holdings
CREATE TABLE IF NOT EXISTS portfolio_holdings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    quantity INTEGER NOT NULL,
    average_price DECIMAL(10,2) NOT NULL,
    current_price DECIMAL(10,2) DEFAULT 0.00,
    invested_amount DECIMAL(15,2) NOT NULL,
    current_value DECIMAL(15,2) DEFAULT 0.00,
    profit_loss DECIMAL(15,2) DEFAULT 0.00,
    profit_loss_percent DECIMAL(5,2) DEFAULT 0.00,
    first_buy_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol)
);

-- Stock Transactions
CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    transaction_type VARCHAR(10) NOT NULL,
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Wallet Transactions
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    description TEXT,
    reference_id VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Watchlist
CREATE TABLE IF NOT EXISTS user_watchlist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    notes TEXT,
    added_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_user ON stock_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON user_watchlist(user_id);
        `;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            db.exec(schema, (err) => {
                db.close();
                if (err) {
                    console.error('Error creating user tables:', err);
                    reject(err);
                } else {
                    console.log('✅ User database tables created/verified');
                    resolve();
                }
            });
        });
    }

    // Helper method to run a query
    async runQuery(sql, params = []) {
        await this.init();
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            db.run(sql, params, function(err) {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve({ lastID: this.lastID, changes: this.changes });
                }
            });
        });
    }

    // Helper method to get a single row
    async getRow(sql, params = []) {
        await this.init();
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            db.get(sql, params, (err, row) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Helper method to get multiple rows
    async getRows(sql, params = []) {
        await this.init();
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            db.all(sql, params, (err, rows) => {
                db.close();
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Helper method for transactions
    async runTransaction(operations) {
        await this.init();
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                let completed = 0;
                let hasError = false;
                const results = [];
                
                const executeNext = (index) => {
                    if (index >= operations.length) {
                        // All operations completed
                        if (hasError) {
                            db.run('ROLLBACK');
                            db.close();
                            reject(new Error('Transaction failed'));
                        } else {
                            db.run('COMMIT', (err) => {
                                db.close();
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(results);
                                }
                            });
                        }
                        return;
                    }
                    
                    const op = operations[index];
                    db.run(op.sql, op.params, function(err) {
                        if (err) {
                            hasError = true;
                            db.run('ROLLBACK');
                            db.close();
                            reject(err);
                            return;
                        }
                        
                        results.push({ lastID: this.lastID, changes: this.changes });
                        executeNext(index + 1);
                    });
                };
                
                executeNext(0);
            });
        });
    }

    // Wallet Methods
    async getWalletBalance(userId) {
        let wallet = await this.getRow('SELECT * FROM user_wallets WHERE user_id = ?', [userId]);
        
        if (!wallet) {
            // Create wallet if doesn't exist
            await this.runQuery(`
                INSERT INTO user_wallets (user_id, balance, total_invested, total_current_value, total_profit_loss)
                VALUES (?, 0.00, 0.00, 0.00, 0.00)
            `, [userId]);
            
            wallet = {
                user_id: userId,
                balance: 0.00,
                total_invested: 0.00,
                total_current_value: 0.00,
                total_profit_loss: 0.00,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
        }
        
        return wallet;
    }

    async updateWalletBalance(userId, amount, transactionType, description = '', referenceId = null) {
        const wallet = await this.getWalletBalance(userId);
        const currentBalance = parseFloat(wallet.balance) || 0;
        let newBalance;
        
        if (transactionType === 'DEPOSIT' || transactionType === 'STOCK_SALE') {
            newBalance = currentBalance + amount;
        } else if (transactionType === 'WITHDRAWAL' || transactionType === 'STOCK_PURCHASE') {
            newBalance = currentBalance - amount;
            if (newBalance < 0) {
                throw new Error('Insufficient balance');
            }
        } else {
            throw new Error('Invalid transaction type');
        }
        
        // Update wallet and add transaction in one go
        const operations = [
            {
                sql: `UPDATE user_wallets SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                params: [newBalance, userId]
            },
            {
                sql: `INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_after, description, reference_id)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                params: [userId, transactionType, amount, newBalance, description, referenceId]
            }
        ];
        
        await this.runTransaction(operations);
        return newBalance;
    }

    // Stock Purchase/Sale Methods
    async buyStock(userId, symbol, companyName, quantity, price) {
        const totalAmount = quantity * price;
        
        // Check balance first
        const wallet = await this.getWalletBalance(userId);
        if (parseFloat(wallet.balance) < totalAmount) {
            throw new Error('Insufficient wallet balance');
        }
        
        // Get existing holding if any
        const existingHolding = await this.getRow(
            'SELECT * FROM portfolio_holdings WHERE user_id = ? AND symbol = ?',
            [userId, symbol]
        );
        
        const operations = [
            // Update wallet balance
            {
                sql: `UPDATE user_wallets SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
                params: [totalAmount, userId]
            },
            // Add wallet transaction
            {
                sql: `INSERT INTO wallet_transactions (user_id, transaction_type, amount, balance_after, description)
                      VALUES (?, 'STOCK_PURCHASE', ?, (SELECT balance FROM user_wallets WHERE user_id = ?), ?)`,
                params: [userId, totalAmount, userId, `Purchased ${quantity} shares of ${symbol}`]
            },
            // Add stock transaction
            {
                sql: `INSERT INTO stock_transactions (user_id, symbol, company_name, transaction_type, quantity, price, total_amount)
                      VALUES (?, ?, ?, 'BUY', ?, ?, ?)`,
                params: [userId, symbol, companyName, quantity, price, totalAmount]
            }
        ];
        
        if (existingHolding) {
            // Update existing holding
            const newQuantity = existingHolding.quantity + quantity;
            const newInvestedAmount = existingHolding.invested_amount + totalAmount;
            const newAveragePrice = newInvestedAmount / newQuantity;
            
            operations.push({
                sql: `UPDATE portfolio_holdings 
                      SET quantity = ?, average_price = ?, invested_amount = ?, last_updated = CURRENT_TIMESTAMP
                      WHERE user_id = ? AND symbol = ?`,
                params: [newQuantity, newAveragePrice, newInvestedAmount, userId, symbol]
            });
        } else {
            // Create new holding
            operations.push({
                sql: `INSERT INTO portfolio_holdings (user_id, symbol, company_name, quantity, average_price, invested_amount)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                params: [userId, symbol, companyName, quantity, price, totalAmount]
            });
        }
        
        const results = await this.runTransaction(operations);
        return {
            transactionId: results[2].lastID,
            message: `Successfully purchased ${quantity} shares of ${symbol}`
        };
    }

    async sellStock(userId, symbol, quantity, price) {
        const totalAmount = quantity * price;
        
        // Check if user has enough shares
        const holding = await this.getRow(
            'SELECT * FROM portfolio_holdings WHERE user_id = ? AND symbol = ?',
            [userId, symbol]
        );
        
        if (!holding || holding.quantity < quantity) {
            throw new Error('Insufficient shares to sell');
        }
        
        const newQuantity = holding.quantity - quantity;
        
        const operations = [
            // Add stock transaction
            {
                sql: `INSERT INTO stock_transactions (user_id, symbol, company_name, transaction_type, quantity, price, total_amount)
                      VALUES (?, ?, ?, 'SELL', ?, ?, ?)`,
                params: [userId, symbol, holding.company_name, quantity, price, totalAmount]
            }
        ];
        
        if (newQuantity === 0) {
            // Delete holding if all sold
            operations.push({
                sql: `DELETE FROM portfolio_holdings WHERE user_id = ? AND symbol = ?`,
                params: [userId, symbol]
            });
        } else {
            // Update holding (proportionally reduce invested amount)
            const newInvestedAmount = (newQuantity / holding.quantity) * holding.invested_amount;
            operations.push({
                sql: `UPDATE portfolio_holdings 
                      SET quantity = ?, invested_amount = ?, last_updated = CURRENT_TIMESTAMP
                      WHERE user_id = ? AND symbol = ?`,
                params: [newQuantity, newInvestedAmount, userId, symbol]
            });
        }
        
        const results = await this.runTransaction(operations);
        return {
            transactionId: results[0].lastID,
            message: `Successfully sold ${quantity} shares of ${symbol}`
        };
    }

    // Portfolio and Transaction Methods
    async getPortfolio(userId) {
        return await this.getRows(`
            SELECT *,
                   (current_value - invested_amount) as profit_loss,
                   CASE 
                       WHEN invested_amount > 0 THEN ((current_value - invested_amount) / invested_amount * 100)
                       ELSE 0 
                   END as profit_loss_percent
            FROM portfolio_holdings 
            WHERE user_id = ?
            ORDER BY invested_amount DESC
        `, [userId]);
    }

    async getTransactionHistory(userId, limit = 50, offset = 0) {
        return await this.getRows(`
            SELECT * FROM stock_transactions 
            WHERE user_id = ?
            ORDER BY transaction_date DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
    }

    async getWalletTransactionHistory(userId, limit = 50, offset = 0) {
        return await this.getRows(`
            SELECT * FROM wallet_transactions 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
    }

    async updatePortfolioCurrentPrices(userId, stockPrices) {
        const operations = [];
        
        for (const [symbol, currentPrice] of Object.entries(stockPrices)) {
            operations.push({
                sql: `UPDATE portfolio_holdings 
                      SET current_price = ?, 
                          current_value = quantity * ?, 
                          profit_loss = (quantity * ?) - invested_amount,
                          profit_loss_percent = CASE 
                              WHEN invested_amount > 0 THEN (((quantity * ?) - invested_amount) / invested_amount * 100)
                              ELSE 0 
                          END,
                          last_updated = CURRENT_TIMESTAMP
                      WHERE user_id = ? AND symbol = ?`,
                params: [currentPrice, currentPrice, currentPrice, currentPrice, userId, symbol]
            });
        }
        
        if (operations.length > 0) {
            await this.runTransaction(operations);
        }
    }

    // Watchlist Methods
    async addToWatchlist(userId, symbol, companyName = null) {
        try {
            const result = await this.runQuery(`
                INSERT INTO user_watchlist (user_id, symbol, company_name)
                VALUES (?, ?, ?)
            `, [userId, symbol.toUpperCase(), companyName]);
            
            return {
                id: result.lastID,
                added: true,
                message: 'Added to watchlist'
            };
        } catch (error) {
            if (error.message.includes('UNIQUE constraint failed')) {
                return {
                    id: null,
                    added: false,
                    message: 'Already in watchlist'
                };
            }
            throw error;
        }
    }

    async removeFromWatchlist(userId, symbol) {
        const result = await this.runQuery(
            'DELETE FROM user_watchlist WHERE user_id = ? AND symbol = ?',
            [userId, symbol.toUpperCase()]
        );
        
        return {
            removed: result.changes > 0,
            message: result.changes > 0 ? 'Removed from watchlist' : 'Not found in watchlist'
        };
    }

    async getWatchlist(userId) {
        return await this.getRows(`
            SELECT * FROM user_watchlist 
            WHERE user_id = ?
            ORDER BY added_date DESC
        `, [userId]);
    }

    async close() {
        // Nothing to close since we create connections per operation
        return Promise.resolve();
    }
}

module.exports = UserStockDatabase;