const UserStockDatabase = require('./userdb');
const { getSimpleStockData } = require('./stockUtils');

// Initialize user database
const userDb = new UserStockDatabase();

/**
 * Get user wallet balance and details
 * @param {number} userId - User ID
 * @returns {Object} Wallet details
 */
async function getUserWallet(userId) {
    try {
        const wallet = await userDb.getWalletBalance(userId);
        return {
            success: true,
            data: {
                userId: wallet.user_id,
                balance: parseFloat(wallet.balance),
                totalInvested: parseFloat(wallet.total_invested),
                totalCurrentValue: parseFloat(wallet.total_current_value),
                totalProfitLoss: parseFloat(wallet.total_profit_loss),
                createdAt: wallet.created_at,
                updatedAt: wallet.updated_at
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get wallet: ${error.message}`
        };
    }
}

/**
 * Add money to user wallet (Deposit)
 * @param {number} userId - User ID
 * @param {number} amount - Amount to add
 * @param {string} description - Transaction description
 * @returns {Object} Result of the operation
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
            data: {
                amountAdded: amount,
                newBalance: parseFloat(newBalance),
                transactionType: 'DEPOSIT',
                description: description
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to add balance: ${error.message}`
        };
    }
}

/**
 * Remove money from user wallet (Withdrawal)
 * @param {number} userId - User ID
 * @param {number} amount - Amount to remove
 * @param {string} description - Transaction description
 * @returns {Object} Result of the operation
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
            data: {
                amountWithdrawn: amount,
                newBalance: parseFloat(newBalance),
                transactionType: 'WITHDRAWAL',
                description: description
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to remove balance: ${error.message}`
        };
    }
}

/**
 * Buy stocks for a user
 * @param {number} userId - User ID
 * @param {string} symbol - Stock symbol (e.g., 'TSLA', 'RELIANCE.NS')
 * @param {number} quantity - Number of shares to buy
 * @param {number} pricePerShare - Price per share (optional, will fetch current price if not provided)
 * @returns {Object} Result of the stock purchase
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
        
        return {
            success: true,
            message: result.message,
            data: {
                transactionId: result.transactionId,
                symbol: symbol,
                companyName: companyName,
                quantity: quantity,
                pricePerShare: stockPrice,
                totalCost: totalCost,
                transactionType: 'BUY',
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to buy stock: ${error.message}`
        };
    }
}

/**
 * Sell stocks for a user
 * @param {number} userId - User ID
 * @param {string} symbol - Stock symbol
 * @param {number} quantity - Number of shares to sell
 * @param {number} pricePerShare - Price per share (optional, will fetch current price if not provided)
 * @returns {Object} Result of the stock sale
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
        
        return {
            success: true,
            message: result.message,
            data: {
                transactionId: result.transactionId,
                symbol: symbol,
                quantity: quantity,
                pricePerShare: stockPrice,
                totalValue: totalValue,
                transactionType: 'SELL',
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to sell stock: ${error.message}`
        };
    }
}

/**
 * Get user's portfolio with current prices
 * @param {number} userId - User ID
 * @param {boolean} updatePrices - Whether to fetch and update current prices
 * @returns {Object} User's portfolio
 */
async function getUserPortfolio(userId, updatePrices = true) {
    try {
        const portfolio = await userDb.getPortfolio(userId);
        
        if (portfolio.length === 0) {
            return {
                success: true,
                data: {
                    totalHoldings: 0,
                    totalInvested: 0,
                    totalCurrentValue: 0,
                    totalPnL: 0,
                    totalPnLPercent: 0,
                    holdings: []
                }
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
        }

        // Calculate totals
        const totalInvested = holdings.reduce((sum, h) => sum + parseFloat(h.invested_amount), 0);
        const totalCurrentValue = holdings.reduce((sum, h) => sum + parseFloat(h.current_value || h.invested_amount), 0);
        const totalPnL = totalCurrentValue - totalInvested;
        const totalPnLPercent = totalInvested > 0 ? ((totalPnL / totalInvested) * 100) : 0;

        return {
            success: true,
            data: {
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
                        averagePrice: avgPrice, // Keep for backward compatibility
                        currentPrice: currentPrice,
                        investedAmount: investedAmount,
                        totalCost: investedAmount, // Add this for frontend compatibility
                        currentValue: currentValue,
                        pnl: parseFloat(pnl.toFixed(2)),
                        pnlPercent: parseFloat(pnlPercent.toFixed(2)),
                        profitLoss: parseFloat(pnl.toFixed(2)), // Keep for backward compatibility
                        profitLossPercent: parseFloat(pnlPercent.toFixed(2)), // Keep for backward compatibility
                        firstBuyDate: h.first_buy_date,
                        lastUpdated: h.last_updated
                    };
                })
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get portfolio: ${error.message}`
        };
    }
}

/**
 * Get user's transaction history
 * @param {number} userId - User ID
 * @param {number} limit - Number of transactions to fetch
 * @param {number} offset - Offset for pagination
 * @returns {Object} Transaction history
 */
async function getTransactionHistory(userId, limit = 50, offset = 0) {
    try {
        const transactions = await userDb.getTransactionHistory(userId, limit, offset);
        
        return {
            success: true,
            data: {
                totalTransactions: transactions.length,
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
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get transaction history: ${error.message}`
        };
    }
}

/**
 * Get user's wallet transaction history
 * @param {number} userId - User ID
 * @param {number} limit - Number of transactions to fetch
 * @param {number} offset - Offset for pagination
 * @returns {Object} Wallet transaction history
 */
async function getWalletTransactionHistory(userId, limit = 50, offset = 0) {
    try {
        const transactions = await userDb.getWalletTransactionHistory(userId, limit, offset);
        
        return {
            success: true,
            data: {
                totalTransactions: transactions.length,
                transactions: transactions.map(t => ({
                    id: t.id,
                    transactionType: t.transaction_type,
                    amount: parseFloat(t.amount),
                    balanceAfter: parseFloat(t.balance_after),
                    description: t.description,
                    referenceId: t.reference_id,
                    createdAt: t.created_at
                }))
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get wallet transaction history: ${error.message}`
        };
    }
}

/**
 * Get user's complete financial summary
 * @param {number} userId - User ID
 * @returns {Object} Complete financial summary
 */
async function getUserFinancialSummary(userId) {
    try {
        const [walletResult, portfolioResult, stockTransactions, walletTransactions] = await Promise.all([
            getUserWallet(userId),
            getUserPortfolio(userId, true),
            getTransactionHistory(userId, 10),
            getWalletTransactionHistory(userId, 10)
        ]);

        if (!walletResult.success) {
            throw new Error(walletResult.error);
        }

        if (!portfolioResult.success) {
            throw new Error(portfolioResult.error);
        }

        return {
            success: true,
            data: {
                wallet: walletResult.data,
                portfolio: portfolioResult.data,
                recentStockTransactions: stockTransactions.success ? stockTransactions.data.transactions : [],
                recentWalletTransactions: walletTransactions.success ? walletTransactions.data.transactions : [],
                summary: {
                    totalNetWorth: walletResult.data.balance + portfolioResult.data.totalCurrentValue,
                    liquidCash: walletResult.data.balance,
                    investedAmount: portfolioResult.data.totalInvested,
                    portfolioValue: portfolioResult.data.totalCurrentValue,
                    totalProfitLoss: portfolioResult.data.totalProfitLoss,
                    totalProfitLossPercent: portfolioResult.data.totalProfitLossPercent
                }
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to get financial summary: ${error.message}`
        };
    }
}

/**
 * Check if user can afford a stock purchase
 * @param {number} userId - User ID
 * @param {string} symbol - Stock symbol
 * @param {number} quantity - Number of shares
 * @param {number} pricePerShare - Price per share (optional)
 * @returns {Object} Affordability check result
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
            data: {
                canAfford: wallet.balance >= totalCost,
                requiredAmount: totalCost,
                availableBalance: parseFloat(wallet.balance),
                shortfall: wallet.balance < totalCost ? totalCost - wallet.balance : 0,
                stockPrice: stockPrice,
                quantity: quantity,
                symbol: symbol
            }
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to check affordability: ${error.message}`
        };
    }
}

/**
 * Add stock to user's watchlist
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
 * Remove stock from user's watchlist
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
 * Get user's watchlist with current prices (flattened response)
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
 * Check if stock is in user's watchlist (flattened response)
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
 * Check if user owns a specific stock and how much (flattened response)
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

// Core wallet functions
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
    
    // Direct database access (if needed)
    userDb,

    // Watchlist functions
    addToWatchlist,
    removeFromWatchlist,
    getUserWatchlist,
    isStockInWatchlist,
    getUserStockHolding
};