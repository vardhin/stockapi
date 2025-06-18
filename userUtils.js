const UserStockDatabase = require('./userdb');
const { getSimpleStockData } = require('./stockUtils');

// Initialize user database
const userDb = new UserStockDatabase();

/**
 * Update wallet totals based on current portfolio
 */
async function updateWalletTotals(userId) {
    try {
        const portfolio = await userDb.getPortfolio(userId);
        
        let totalInvested = 0;
        let totalCurrentValue = 0;
        
        for (const holding of portfolio) {
            totalInvested += parseFloat(holding.invested_amount || 0);
            totalCurrentValue += parseFloat(holding.current_value || holding.invested_amount || 0);
        }
        
        const totalProfitLoss = totalCurrentValue - totalInvested;
        
        // Update wallet table
        await new Promise((resolve, reject) => {
            const db = userDb.getConnection();
            const stmt = db.prepare(`
                UPDATE user_wallets 
                SET total_invested = ?, total_current_value = ?, total_profit_loss = ?, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            `);
            
            stmt.run([totalInvested, totalCurrentValue, totalProfitLoss, userId], function(err) {
                stmt.finalize();
                db.close();
                if (err) reject(err);
                else resolve();
            });
        });
        
        return { totalInvested, totalCurrentValue, totalProfitLoss };
    } catch (error) {
        console.error('Failed to update wallet totals:', error.message);
        return { totalInvested: 0, totalCurrentValue: 0, totalProfitLoss: 0 };
    }
}

/**
 * Get user wallet balance and details (FLATTENED)
 */
async function getUserWallet(userId) {
    try {
        // Update wallet totals first
        await updateWalletTotals(userId);
        
        const wallet = await userDb.getWalletBalance(userId);
        
        return {
            success: true,
            userId: wallet.user_id,
            balance: parseFloat(wallet.balance),
            totalInvested: parseFloat(wallet.total_invested || 0),
            totalCurrentValue: parseFloat(wallet.total_current_value || 0),
            totalProfitLoss: parseFloat(wallet.total_profit_loss || 0),
            totalProfitLossPercent: wallet.total_invested > 0 ? 
                ((wallet.total_profit_loss / wallet.total_invested) * 100) : 0,
            totalNetWorth: parseFloat(wallet.balance) + parseFloat(wallet.total_current_value || 0),
            createdAt: wallet.created_at,
            updatedAt: wallet.updated_at
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get wallet: ${error.message}`
        };
    }
}

/**
 * Add money to user wallet (FLATTENED)
 */
async function addUserBalance(userId, amount, description = 'Wallet deposit') {
    try {
        if (amount <= 0) {
            return {
                success: false,
                error: 'Amount must be greater than 0'
            };
        }

        const newBalance = await userDb.updateWalletBalance(userId, amount, 'DEPOSIT', description);
        
        return {
            success: true,
            message: `Successfully added ₹${amount} to wallet`,
            amountAdded: amount,
            newBalance: parseFloat(newBalance),
            transactionType: 'DEPOSIT',
            description: description
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to add balance: ${error.message}`
        };
    }
}

/**
 * Remove money from user wallet (FLATTENED)
 */
async function removeUserBalance(userId, amount, description = 'Wallet withdrawal') {
    try {
        if (amount <= 0) {
            return {
                success: false,
                error: 'Amount must be greater than 0'
            };
        }

        const wallet = await userDb.getWalletBalance(userId);
        if (wallet.balance < amount) {
            return {
                success: false,
                error: `Insufficient balance. Available: ₹${wallet.balance}, Requested: ₹${amount}`
            };
        }

        const newBalance = await userDb.updateWalletBalance(userId, amount, 'WITHDRAWAL', description);
        
        return {
            success: true,
            message: `Successfully withdrew ₹${amount} from wallet`,
            amountWithdrawn: amount,
            newBalance: parseFloat(newBalance),
            transactionType: 'WITHDRAWAL',
            description: description
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to remove balance: ${error.message}`
        };
    }
}

/**
 * Buy stocks for a user (FLATTENED)
 */
async function buyStock(userId, symbol, quantity, pricePerShare = null) {
    try {
        if (quantity <= 0) {
            return {
                success: false,
                error: 'Quantity must be greater than 0'
            };
        }

        // Get current stock price if not provided
        let stockPrice = pricePerShare;
        let stockData = null;
        
        if (!stockPrice) {
            const stockResult = await getSimpleStockData(symbol);
            stockData = stockResult;
            stockPrice = stockResult.currentPrice;
            
            if (!stockPrice) {
                return {
                    success: false,
                    error: `Could not fetch current price for ${symbol}`
                };
            }
        }

        const totalCost = quantity * stockPrice;
        
        // Check if user has sufficient balance
        const wallet = await userDb.getWalletBalance(userId);
        if (wallet.balance < totalCost) {
            return {
                success: false,
                error: `Insufficient balance. Required: ₹${totalCost.toFixed(2)}, Available: ₹${wallet.balance}`
            };
        }

        // Get company name
        const companyName = stockData ? 
            (stockData.symbol || symbol) : 
            symbol;

        // Execute the stock purchase
        const result = await userDb.buyStock(userId, symbol, companyName, quantity, stockPrice);
        
        // Update wallet totals
        await updateWalletTotals(userId);
        
        return {
            success: true,
            message: result.message,
            transactionId: result.transactionId,
            symbol: symbol,
            companyName: companyName,
            quantity: quantity,
            pricePerShare: stockPrice,
            totalCost: totalCost,
            transactionType: 'BUY',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to buy stock: ${error.message}`
        };
    }
}

/**
 * Sell stocks for a user (FLATTENED)
 */
async function sellStock(userId, symbol, quantity, pricePerShare = null) {
    try {
        if (quantity <= 0) {
            return {
                success: false,
                error: 'Quantity must be greater than 0'
            };
        }

        // Check if user has the stock in portfolio
        const portfolio = await userDb.getPortfolio(userId);
        const holding = portfolio.find(h => h.symbol === symbol);
        
        if (!holding) {
            return {
                success: false,
                error: `You don't own any shares of ${symbol}`
            };
        }

        if (holding.quantity < quantity) {
            return {
                success: false,
                error: `Insufficient shares. You own ${holding.quantity} shares, trying to sell ${quantity}`
            };
        }

        // Get current stock price if not provided
        let stockPrice = pricePerShare;
        
        if (!stockPrice) {
            const stockData = await getSimpleStockData(symbol);
            stockPrice = stockData.currentPrice;
            
            if (!stockPrice) {
                return {
                    success: false,
                    error: `Could not fetch current price for ${symbol}`
                };
            }
        }

        const totalValue = quantity * stockPrice;

        // Execute the stock sale
        const result = await userDb.sellStock(userId, symbol, quantity, stockPrice);
        
        // Add the sale proceeds to wallet balance
        // This was the problematic line - it should call addUserBalance directly
        const walletResult = await addUserBalance(userId, totalValue, `Sold ${quantity} shares of ${symbol} at ₹${stockPrice.toFixed(2)} per share`);
        
        if (!walletResult.success) {
            throw new Error(`Failed to update wallet: ${walletResult.error}`);
        }
        
        // Update wallet totals
        await updateWalletTotals(userId);
        
        return {
            success: true,
            message: result.message,
            transactionId: result.transactionId,
            symbol: symbol,
            quantity: quantity,
            pricePerShare: stockPrice,
            totalValue: totalValue,
            transactionType: 'SELL',
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to sell stock: ${error.message}`
        };
    }
}

/**
 * Get user's portfolio with current prices (FLATTENED)
 */
async function getUserPortfolio(userId, updatePrices = true) {
    try {
        const portfolio = await userDb.getPortfolio(userId);
        
        if (portfolio.length === 0) {
            return {
                success: true,
                totalHoldings: 0,
                totalInvested: 0,
                totalCurrentValue: 0,
                totalPnL: 0,
                totalPnLPercent: 0,
                holdings: []
            };
        }

        let holdings = portfolio;

        // Update current prices if requested
        if (updatePrices) {
            const stockPrices = {};
            
            // Fetch current prices for all holdings
            for (const holding of portfolio) {
                try {
                    const stockData = await getSimpleStockData(holding.symbol);
                    stockPrices[holding.symbol] = stockData.currentPrice;
                } catch (error) {
                    console.error(`Failed to fetch price for ${holding.symbol}:`, error.message);
                    stockPrices[holding.symbol] = holding.current_price || holding.average_price;
                }
            }

            // Update portfolio with current prices
            await userDb.updatePortfolioCurrentPrices(userId, stockPrices);
            
            // Get updated portfolio
            holdings = await userDb.getPortfolio(userId);
            
            // Update wallet totals after price updates
            await updateWalletTotals(userId);
        }

        // Calculate totals
        const totalInvested = holdings.reduce((sum, h) => sum + parseFloat(h.invested_amount), 0);
        const totalCurrentValue = holdings.reduce((sum, h) => sum + parseFloat(h.current_value || h.invested_amount), 0);
        const totalPnL = totalCurrentValue - totalInvested;
        const totalPnLPercent = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0;

        return {
            success: true,
            totalHoldings: holdings.length,
            totalInvested: parseFloat(totalInvested.toFixed(2)),
            totalCurrentValue: parseFloat(totalCurrentValue.toFixed(2)),
            totalPnL: parseFloat(totalPnL.toFixed(2)),
            totalPnLPercent: parseFloat(totalPnLPercent.toFixed(2)),
            holdings: holdings.map(h => {
                const quantity = parseInt(h.quantity) || 0;
                const avgPrice = parseFloat(h.average_price) || 0;
                const currentPrice = parseFloat(h.current_price || h.average_price) || 0;
                const investedAmount = parseFloat(h.invested_amount) || 0;
                const currentValue = quantity * currentPrice;
                const pnl = currentValue - investedAmount;
                const pnlPercent = investedAmount > 0 ? ((pnl / investedAmount) * 100) : 0;

                return {
                    symbol: h.symbol,
                    companyName: h.company_name,
                    quantity: quantity,
                    avgPrice: avgPrice,
                    currentPrice: currentPrice,
                    investedAmount: investedAmount,
                    currentValue: currentValue,
                    pnl: parseFloat(pnl.toFixed(2)),
                    pnlPercent: parseFloat(pnlPercent.toFixed(2)),
                    firstBuyDate: h.first_buy_date,
                    lastUpdated: h.last_updated
                };
            })
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get portfolio: ${error.message}`
        };
    }
}

/**
 * Get user's transaction history (FLATTENED)
 */
async function getTransactionHistory(userId, limit = 50, offset = 0) {
    try {
        const transactions = await userDb.getTransactionHistory(userId, limit, offset);
        
        return {
            success: true,
            totalTransactions: transactions.length,
            limit: limit,
            offset: offset,
            transactions: transactions.map(t => ({
                id: t.id,
                symbol: t.symbol,
                companyName: t.company_name,
                transactionType: t.transaction_type,
                quantity: t.quantity,
                price: parseFloat(t.price),
                totalAmount: parseFloat(t.total_amount),
                transactionDate: t.transaction_date
            }))
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get transaction history: ${error.message}`
        };
    }
}

/**
 * Get user's wallet transaction history (FLATTENED)
 */
async function getWalletTransactionHistory(userId, limit = 50, offset = 0) {
    try {
        const transactions = await userDb.getWalletTransactionHistory(userId, limit, offset);
        
        return {
            success: true,
            totalTransactions: transactions.length,
            limit: limit,
            offset: offset,
            transactions: transactions.map(t => ({
                id: t.id,
                transactionType: t.transaction_type,
                amount: parseFloat(t.amount),
                balanceAfter: parseFloat(t.balance_after),
                description: t.description,
                referenceId: t.reference_id,
                createdAt: t.created_at
            }))
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get wallet transaction history: ${error.message}`
        };
    }
}

/**
 * Get user's complete financial summary (FLATTENED)
 */
async function getUserFinancialSummary(userId) {
    try {
        const [wallet, portfolio, stockTransactions, walletTransactions] = await Promise.all([
            getUserWallet(userId),
            getUserPortfolio(userId, true),
            getTransactionHistory(userId, 10),
            getWalletTransactionHistory(userId, 10)
        ]);

        if (!wallet.success) {
            throw new Error(wallet.error);
        }

        if (!portfolio.success) {
            throw new Error(portfolio.error);
        }

        return {
            success: true,
            // Wallet info
            userId: wallet.userId,
            balance: wallet.balance,
            totalInvested: wallet.totalInvested,
            totalCurrentValue: wallet.totalCurrentValue,
            totalProfitLoss: wallet.totalProfitLoss,
            totalProfitLossPercent: wallet.totalProfitLossPercent,
            totalNetWorth: wallet.totalNetWorth,
            
            // Portfolio summary
            totalHoldings: portfolio.totalHoldings,
            portfolioInvested: portfolio.totalInvested,
            portfolioCurrentValue: portfolio.totalCurrentValue,
            portfolioPnL: portfolio.totalPnL,
            portfolioPnLPercent: portfolio.totalPnLPercent,
            
            // Holdings
            holdings: portfolio.holdings,
            
            // Recent transactions
            recentStockTransactions: stockTransactions.success ? stockTransactions.transactions : [],
            recentWalletTransactions: walletTransactions.success ? walletTransactions.transactions : [],
            
            // Timestamps
            walletUpdatedAt: wallet.updatedAt,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get financial summary: ${error.message}`
        };
    }
}

/**
 * Check if user can afford a stock purchase (FLATTENED)
 */
async function canAffordStock(userId, symbol, quantity, pricePerShare = null) {
    try {
        let stockPrice = pricePerShare;
        
        if (!stockPrice) {
            const stockData = await getSimpleStockData(symbol);
            stockPrice = stockData.currentPrice;
        }

        const totalCost = quantity * stockPrice;
        const wallet = await userDb.getWalletBalance(userId);
        
        return {
            success: true,
            canAfford: wallet.balance >= totalCost,
            requiredAmount: totalCost,
            availableBalance: parseFloat(wallet.balance),
            shortfall: wallet.balance < totalCost ? totalCost - wallet.balance : 0,
            stockPrice: stockPrice,
            quantity: quantity,
            symbol: symbol
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to check affordability: ${error.message}`
        };
    }
}

/**
 * Add stock to user's watchlist (FLATTENED)
 */
async function addToWatchlist(userId, symbol) {
    try {
        // Get company name from stock data
        let companyName = symbol;
        try {
            const stockData = await getSimpleStockData(symbol);
            companyName = stockData.symbol || symbol;
        } catch (error) {
            console.log(`Could not fetch company name for ${symbol}`);
        }

        const result = await userDb.addToWatchlist(userId, symbol, companyName);
        
        return {
            success: true,
            added: result.added,
            symbol: symbol.toUpperCase(),
            companyName: companyName,
            message: result.message
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to add to watchlist: ${error.message}`
        };
    }
}

/**
 * Remove stock from user's watchlist (FLATTENED)
 */
async function removeFromWatchlist(userId, symbol) {
    try {
        const result = await userDb.removeFromWatchlist(userId, symbol);
        
        return {
            success: true,
            removed: result.removed,
            symbol: symbol.toUpperCase(),
            message: result.message
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to remove from watchlist: ${error.message}`
        };
    }
}

/**
 * Get user's watchlist with current prices (FLATTENED)
 */
async function getUserWatchlist(userId, includePrices = true) {
    try {
        const watchlist = await userDb.getWatchlist(userId);
        
        if (watchlist.length === 0) {
            return {
                success: true,
                totalStocks: 0,
                stocks: []
            };
        }

        let stocks = [];

        // Fetch current prices if requested
        if (includePrices) {
            for (const stock of watchlist) {
                try {
                    const stockData = await getSimpleStockData(stock.symbol);
                    const changeAmount = stockData.currentPrice - stockData.previousClose;
                    const changePercent = ((changeAmount / stockData.previousClose) * 100);
                    
                    stocks.push({
                        id: stock.id,
                        symbol: stock.symbol,
                        companyName: stock.company_name,
                        addedDate: stock.added_date,
                        currentPrice: stockData.currentPrice,
                        previousClose: stockData.previousClose,
                        dayHigh: stockData.dayHigh,
                        dayLow: stockData.dayLow,
                        volume: stockData.volume,
                        change: changeAmount,
                        changePercent: changePercent,
                        isPositive: changeAmount >= 0,
                        priceUpdated: true
                    });
                } catch (error) {
                    console.error(`Failed to fetch price for ${stock.symbol}:`, error.message);
                    stocks.push({
                        id: stock.id,
                        symbol: stock.symbol,
                        companyName: stock.company_name,
                        addedDate: stock.added_date,
                        priceUpdated: false,
                        error: 'Price unavailable'
                    });
                }
                
                // Add small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else {
            stocks = watchlist.map(stock => ({
                id: stock.id,
                symbol: stock.symbol,
                companyName: stock.company_name,
                addedDate: stock.added_date
            }));
        }

        return {
            success: true,
            totalStocks: stocks.length,
            stocks: stocks
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get watchlist: ${error.message}`
        };
    }
}

/**
 * Check if stock is in user's watchlist (FLATTENED)
 */
async function isStockInWatchlist(userId, symbol) {
    try {
        const isInWatchlist = await userDb.isInWatchlist(userId, symbol);
        
        return {
            success: true,
            symbol: symbol.toUpperCase(),
            inWatchlist: isInWatchlist
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to check watchlist: ${error.message}`
        };
    }
}

/**
 * Check if user owns a specific stock and how much (FLATTENED)
 */
async function getUserStockHolding(userId, symbol) {
    try {
        const portfolio = await userDb.getPortfolio(userId);
        const holding = portfolio.find(h => h.symbol.toUpperCase() === symbol.toUpperCase());
        
        if (!holding) {
            return {
                success: true,
                symbol: symbol.toUpperCase(),
                owns: false,
                quantity: 0,
                message: `You don't own any shares of ${symbol}`
            };
        }

        return {
            success: true,
            symbol: holding.symbol,
            owns: true,
            quantity: holding.quantity,
            averagePrice: parseFloat(holding.average_price),
            investedAmount: parseFloat(holding.invested_amount),
            currentPrice: parseFloat(holding.current_price || holding.average_price),
            currentValue: holding.quantity * (holding.current_price || holding.average_price),
            profitLoss: parseFloat(holding.profit_loss || 0),
            firstBuyDate: holding.first_buy_date
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to check stock holding: ${error.message}`
        };
    }
}

// Database cleanup function
async function closeUserDatabase() {
    await userDb.close();
}

module.exports = {
    getUserWallet,
    addUserBalance,
    removeUserBalance,
    
    // Stock trading functions
    buyStock,
    sellStock,
    canAffordStock,
    
    // Portfolio and history functions
    getUserPortfolio,
    getTransactionHistory,
    getWalletTransactionHistory,
    getUserFinancialSummary,
    
    // Watchlist functions
    addToWatchlist,
    removeFromWatchlist,
    getUserWatchlist,
    isStockInWatchlist,
    getUserStockHolding,
    
    // Cleanup
    closeUserDatabase
};