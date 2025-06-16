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
                // Close this initialization connection
                db.close();
            });
        });
    }

    getConnection() {
        return new sqlite3.Database(this.dbPath);
    }

    async createTables() {
        const schemaPath = path.join(__dirname, 'user_schema.sql');
        
        // Create schema file if it doesn't exist
        if (!fs.existsSync(schemaPath)) {
            await this.createSchemaFile(schemaPath);
        }
        
        const schema = fs.readFileSync(schemaPath, 'utf8');
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            db.exec(schema, (err) => {
                if (err) {
                    console.error('Error creating user tables:', err);
                    reject(err);
                } else {
                    console.log('✅ User database tables created/verified');
                    resolve();
                }
                db.close();
            });
        });
    }

    async createSchemaFile(schemaPath) {
        const schema = `-- Simplified User Stock Market Database Schema

-- 1. User Wallets (Virtual money for trading)
CREATE TABLE IF NOT EXISTS user_wallets (
    user_id INTEGER PRIMARY KEY,
    balance DECIMAL(15,2) DEFAULT 0.00,
    total_invested DECIMAL(15,2) DEFAULT 0.00,
    total_current_value DECIMAL(15,2) DEFAULT 0.00,
    total_profit_loss DECIMAL(15,2) DEFAULT 0.00,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 2. Portfolio Holdings (Current stock positions)
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
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    UNIQUE(user_id, symbol)
);

-- 3. Stock Transactions (Buy/Sell history)
CREATE TABLE IF NOT EXISTS stock_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    transaction_type VARCHAR(10) NOT NULL, -- 'BUY', 'SELL'
    quantity INTEGER NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 4. Wallet Transactions (Money in/out)
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    transaction_type VARCHAR(20) NOT NULL, -- 'DEPOSIT', 'WITHDRAWAL', 'STOCK_PURCHASE', 'STOCK_SALE'
    amount DECIMAL(15,2) NOT NULL,
    balance_after DECIMAL(15,2) NOT NULL,
    description TEXT,
    reference_id VARCHAR(100), -- Transaction ID for stock purchases/sales
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_portfolio_user ON portfolio_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_transactions_user ON stock_transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user ON wallet_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON portfolio_holdings(symbol);
`;

        fs.writeFileSync(schemaPath, schema);
    }

    // Wallet Methods
    async getWalletBalance(userId) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare('SELECT * FROM user_wallets WHERE user_id = ?');
            stmt.get([userId], (err, row) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    // Create wallet if doesn't exist
                    if (!row) {
                        this.createWallet(userId).then(resolve).catch(reject);
                    } else {
                        resolve(row);
                    }
                }
                
                db.close();
            });
        });
    }

    async createWallet(userId) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare(`
                INSERT INTO user_wallets (user_id, balance, total_invested, total_current_value, total_profit_loss)
                VALUES (?, 0.00, 0.00, 0.00, 0.00)
            `);
            
            stmt.run([userId], function(err) {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        user_id: userId,
                        balance: 0.00,
                        total_invested: 0.00,
                        total_current_value: 0.00,
                        total_profit_loss: 0.00
                    });
                }
                
                db.close();
            });
        });
    }

    async updateWalletBalance(userId, amount, transactionType, description = '', referenceId = null) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Get current balance
                const getBalance = db.prepare('SELECT balance FROM user_wallets WHERE user_id = ?');
                getBalance.get([userId], (err, wallet) => {
                    getBalance.finalize();
                    
                    if (err) {
                        db.run('ROLLBACK');
                        db.close();
                        reject(err);
                        return;
                    }
                    
                    const currentBalance = wallet ? wallet.balance : 0;
                    let newBalance;
                    
                    if (transactionType === 'DEPOSIT') {
                        newBalance = currentBalance + amount;
                    } else if (transactionType === 'WITHDRAWAL' || transactionType === 'STOCK_PURCHASE') {
                        newBalance = currentBalance - amount;
                        if (newBalance < 0) {
                            db.run('ROLLBACK');
                            db.close();
                            reject(new Error('Insufficient balance'));
                            return;
                        }
                    } else if (transactionType === 'STOCK_SALE') {
                        newBalance = currentBalance + amount;
                    } else {
                        db.run('ROLLBACK');
                        db.close();
                        reject(new Error('Invalid transaction type'));
                        return;
                    }
                    
                    // Update wallet balance
                    const updateWallet = db.prepare(`
                        INSERT OR REPLACE INTO user_wallets (user_id, balance, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    `);
                    updateWallet.run([userId, newBalance], (err) => {
                        updateWallet.finalize();
                        
                        if (err) {
                            db.run('ROLLBACK');
                            db.close();
                            reject(err);
                            return;
                        }
                        
                        // Add wallet transaction record
                        const addTransaction = db.prepare(`
                            INSERT INTO wallet_transactions 
                            (user_id, transaction_type, amount, balance_after, description, reference_id)
                            VALUES (?, ?, ?, ?, ?, ?)
                        `);
                        addTransaction.run([userId, transactionType, amount, newBalance, description, referenceId], 
                            function(err) {
                                addTransaction.finalize();
                                
                                if (err) {
                                    db.run('ROLLBACK');
                                    db.close();
                                    reject(err);
                                } else {
                                    db.run('COMMIT', (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            db.close();
                                            reject(err);
                                        } else {
                                            db.close();
                                            resolve(newBalance);
                                        }
                                    });
                                }
                            });
                    });
                });
            });
        });
    }

    // Stock Purchase/Sale Methods
    async buyStock(userId, symbol, companyName, quantity, price) {
        await this.init();
        
        const totalAmount = quantity * price;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Check wallet balance
                this.getWalletBalance(userId).then(wallet => {
                    if (wallet.balance < totalAmount) {
                        db.run('ROLLBACK');
                        db.close();
                        reject(new Error('Insufficient wallet balance'));
                        return;
                    }
                    
                    // Update wallet balance
                    this.updateWalletBalance(userId, totalAmount, 'STOCK_PURCHASE', 
                        `Purchased ${quantity} shares of ${symbol}`, null)
                        .then(() => {
                            // Add stock transaction
                            const addStockTransaction = db.prepare(`
                                INSERT INTO stock_transactions 
                                (user_id, symbol, company_name, transaction_type, quantity, price, total_amount)
                                VALUES (?, ?, ?, 'BUY', ?, ?, ?)
                            `);
                            
                            addStockTransaction.run([userId, symbol, companyName, quantity, price, totalAmount], 
                                function(err) {
                                    addStockTransaction.finalize();
                                    
                                    if (err) {
                                        db.run('ROLLBACK');
                                        db.close();
                                        reject(err);
                                        return;
                                    }
                                    
                                    const transactionId = this.lastID;
                                    
                                    // Update portfolio holding
                                    const portfolioPromise = new Promise((portfolioResolve, portfolioReject) => {
                                        const getHolding = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? AND symbol = ?');
                                        getHolding.get([userId, symbol], (err, holding) => {
                                            getHolding.finalize();
                                            
                                            if (err) {
                                                portfolioReject(err);
                                                return;
                                            }
                                            
                                            if (holding) {
                                                // Update existing holding
                                                const newQuantity = holding.quantity + quantity;
                                                const newInvestedAmount = holding.invested_amount + (quantity * price);
                                                const newAveragePrice = newInvestedAmount / newQuantity;
                                                
                                                const updateStmt = db.prepare(`
                                                    UPDATE portfolio_holdings 
                                                    SET quantity = ?, average_price = ?, invested_amount = ?, last_updated = CURRENT_TIMESTAMP
                                                    WHERE user_id = ? AND symbol = ?
                                                `);
                                                updateStmt.run([newQuantity, newAveragePrice, newInvestedAmount, userId, symbol], 
                                                    function(err) {
                                                        updateStmt.finalize();
                                                        if (err) portfolioReject(err);
                                                        else portfolioResolve();
                                                    });
                                            } else {
                                                // Create new holding
                                                const insertStmt = db.prepare(`
                                                    INSERT INTO portfolio_holdings 
                                                    (user_id, symbol, company_name, quantity, average_price, invested_amount)
                                                    VALUES (?, ?, ?, ?, ?, ?)
                                                `);
                                                insertStmt.run([userId, symbol, companyName, quantity, price, quantity * price], 
                                                    function(err) {
                                                        insertStmt.finalize();
                                                        if (err) portfolioReject(err);
                                                        else portfolioResolve();
                                                    });
                                            }
                                        });
                                    });
                                    
                                    portfolioPromise
                                        .then(() => {
                                            db.run('COMMIT', (err) => {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    db.close();
                                                    reject(err);
                                                } else {
                                                    db.close();
                                                    resolve({
                                                        transactionId,
                                                        message: `Successfully purchased ${quantity} shares of ${symbol}`
                                                    });
                                                }
                                            });
                                        })
                                        .catch(err => {
                                            db.run('ROLLBACK');
                                            db.close();
                                            reject(err);
                                        });
                                });
                        })
                        .catch(err => {
                            db.run('ROLLBACK');
                            db.close();
                            reject(err);
                        });
                }).catch(err => {
                    db.run('ROLLBACK');
                    db.close();
                    reject(err);
                });
            });
        });
    }

    async sellStock(userId, symbol, quantity, price) {
        await this.init();
        
        const totalAmount = quantity * price;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                // Check if user has enough shares
                const getHolding = db.prepare('SELECT * FROM portfolio_holdings WHERE user_id = ? AND symbol = ?');
                getHolding.get([userId, symbol], (err, holding) => {
                    getHolding.finalize();
                    
                    if (err) {
                        db.run('ROLLBACK');
                        db.close();
                        reject(err);
                        return;
                    }
                    
                    if (!holding || holding.quantity < quantity) {
                        db.run('ROLLBACK');
                        db.close();
                        reject(new Error('Insufficient shares to sell'));
                        return;
                    }
                    
                    // Add stock transaction
                    const addStockTransaction = db.prepare(`
                        INSERT INTO stock_transactions 
                        (user_id, symbol, company_name, transaction_type, quantity, price, total_amount)
                        VALUES (?, ?, ?, 'SELL', ?, ?, ?)
                    `);
                    
                    addStockTransaction.run([userId, symbol, holding.company_name, quantity, price, totalAmount], 
                        function(err) {
                            addStockTransaction.finalize();
                            
                            if (err) {
                                db.run('ROLLBACK');
                                db.close();
                                reject(err);
                                return;
                            }
                            
                            const transactionId = this.lastID;
                            
                            // Update portfolio holding
                            const newQuantity = holding.quantity - quantity;
                            
                            const portfolioPromise = new Promise((portfolioResolve, portfolioReject) => {
                                if (newQuantity === 0) {
                                    // Delete holding if all sold
                                    const deleteStmt = db.prepare('DELETE FROM portfolio_holdings WHERE user_id = ? AND symbol = ?');
                                    deleteStmt.run([userId, symbol], function(err) {
                                        deleteStmt.finalize();
                                        if (err) portfolioReject(err);
                                        else portfolioResolve();
                                    });
                                } else {
                                    // Update quantity (proportionally reduce invested amount)
                                    const newInvestedAmount = (newQuantity / holding.quantity) * holding.invested_amount;
                                    const updateStmt = db.prepare(`
                                        UPDATE portfolio_holdings 
                                        SET quantity = ?, invested_amount = ?, last_updated = CURRENT_TIMESTAMP
                                        WHERE user_id = ? AND symbol = ?
                                    `);
                                    updateStmt.run([newQuantity, newInvestedAmount, userId, symbol], 
                                        function(err) {
                                            updateStmt.finalize();
                                            if (err) portfolioReject(err);
                                            else portfolioResolve();
                                        });
                                }
                            });
                            
                            portfolioPromise
                                .then(() => {
                                    // Update wallet balance
                                    return this.updateWalletBalance(userId, totalAmount, 'STOCK_SALE', 
                                        `Sold ${quantity} shares of ${symbol}`, transactionId);
                                })
                                .then(() => {
                                    db.run('COMMIT', (err) => {
                                        if (err) {
                                            db.run('ROLLBACK');
                                            db.close();
                                            reject(err);
                                        } else {
                                            db.close();
                                            resolve({
                                                transactionId,
                                                message: `Successfully sold ${quantity} shares of ${symbol}`
                                            });
                                        }
                                    });
                                })
                                .catch(err => {
                                    db.run('ROLLBACK');
                                    db.close();
                                    reject(err);
                                });
                        });
                });
            });
        });
    }

    // Get user portfolio
    async getPortfolio(userId) {
        await this.init();
        
        const sql = `
            SELECT 
                *,
                (current_value - invested_amount) as profit_loss,
                CASE 
                    WHEN invested_amount > 0 THEN ((current_value - invested_amount) / invested_amount * 100)
                    ELSE 0 
                END as profit_loss_percent
            FROM portfolio_holdings 
            WHERE user_id = ?
            ORDER BY invested_amount DESC
        `;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare(sql);
            stmt.all([userId], (err, rows) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
                
                db.close();
            });
        });
    }

    // Get transaction history
    async getTransactionHistory(userId, limit = 50, offset = 0) {
        await this.init();
        
        const sql = `
            SELECT * FROM stock_transactions 
            WHERE user_id = ?
            ORDER BY transaction_date DESC
            LIMIT ? OFFSET ?
        `;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare(sql);
            stmt.all([userId, limit, offset], (err, rows) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
                
                db.close();
            });
        });
    }

    // Get wallet transaction history
    async getWalletTransactionHistory(userId, limit = 50, offset = 0) {
        await this.init();
        
        const sql = `
            SELECT * FROM wallet_transactions 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            const stmt = db.prepare(sql);
            stmt.all([userId, limit, offset], (err, rows) => {
                stmt.finalize();
                
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
                
                db.close();
            });
        });
    }

    // Update portfolio current prices (to be called periodically)
    async updatePortfolioCurrentPrices(userId, stockPrices) {
        await this.init();
        
        return new Promise((resolve, reject) => {
            const db = this.getConnection();
            
            const updateStmt = db.prepare(`
                UPDATE portfolio_holdings 
                SET current_price = ?, current_value = quantity * ?, 
                    profit_loss = (quantity * ?) - invested_amount,
                    profit_loss_percent = CASE 
                        WHEN invested_amount > 0 THEN (((quantity * ?) - invested_amount) / invested_amount * 100)
                        ELSE 0 
                    END,
                    last_updated = CURRENT_TIMESTAMP
                WHERE user_id = ? AND symbol = ?
            `);
            
            let completed = 0;
            const total = Object.keys(stockPrices).length;
            
            if (total === 0) {
                updateStmt.finalize();
                db.close();
                resolve();
                return;
            }
            
            for (const [symbol, currentPrice] of Object.entries(stockPrices)) {
                updateStmt.run([currentPrice, currentPrice, currentPrice, currentPrice, userId, symbol], 
                    function(err) {
                        completed++;
                        if (completed === total) {
                            updateStmt.finalize();
                            db.close();
                            if (err) reject(err);
                            else resolve();
                        }
                    });
            }
        });
    }

    async close() {
        if (this.isInitialized) {
            console.log('👤 User database connection closed');
            this.isInitialized = false;
        }
    }
}

module.exports = UserStockDatabase;