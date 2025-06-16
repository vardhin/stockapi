const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const {
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
    closeDatabase
} = require('./stockUtils');

// Import authentication functions
const {
    signup,
    signin,
    refreshToken,
    logout,
    getCurrentUser,
    authenticate,
    securityHeaders,
    extractBearerToken
} = require('./auth');

// Import user trading functions
const {
    getUserWallet,
    addUserBalance,
    removeUserBalance,
    buyStock,
    sellStock,
    canAffordStock,
    getUserPortfolio,
    getTransactionHistory,
    getWalletTransactionHistory,
    getUserFinancialSummary,
    closeUserDatabase
} = require('./userUtils');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(securityHeaders()); // Add security headers from auth
app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080'],
    credentials: true
}));
app.use(express.json());

// Rate limiting with different limits for auth endpoints
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    // Skip validation for local development
    validate: {
        xForwardedForHeader: false
    }
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts from this IP, please try again later.',
        retryAfter: '15 minutes'
    },
    // Skip validation for local development
    validate: {
        xForwardedForHeader: false
    }
});

app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// Helper function to handle async routes
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'Stock API Server with Authentication & Trading',
        version: '1.2.0',
        endpoints: {
            // Authentication endpoints
            'POST /api/auth/signup': 'User registration (with ₹1,000,000 starting balance)',
            'POST /api/auth/signup-simple': 'Simple user registration',
            'POST /api/auth/signin': 'User login',
            'POST /api/auth/signin-simple': 'Simple user login',
            'POST /api/auth/refresh': 'Refresh access token',
            'POST /api/auth/logout': 'User logout (requires auth)',
            'GET /api/auth/me': 'Get current user info (requires auth)',
            
            // User Trading endpoints (require auth)
            'GET /api/user/wallet': 'Get user wallet balance and details',
            'POST /api/user/wallet/deposit': 'Add money to wallet',
            'POST /api/user/wallet/withdraw': 'Withdraw money from wallet',
            'GET /api/user/wallet/transactions': 'Get wallet transaction history',
            'POST /api/user/stocks/buy': 'Buy stocks',
            'POST /api/user/stocks/sell': 'Sell stocks',
            'GET /api/user/portfolio': 'Get user portfolio',
            'GET /api/user/transactions': 'Get stock transaction history',
            'GET /api/user/summary': 'Get complete financial summary',
            'POST /api/user/stocks/check-affordability': 'Check if user can afford stock purchase',
            
            // Stock API endpoints
            'GET /': 'API Information',
            'GET /api/stock/:symbol': 'Get basic stock data',
            'GET /api/stock/:symbol/quote': 'Get enhanced stock quote',
            'GET /api/stock/:symbol/details': 'Get detailed stock information',
            'GET /api/stock/:symbol/intraday': 'Get intraday data (1 day)',
            'GET /api/stock/:symbol/weekly': 'Get weekly data (5 days)',
            'GET /api/stock/:symbol/monthly': 'Get monthly data (1 month)',
            'GET /api/stock/:symbol/quarterly': 'Get quarterly data (3 months)',
            'GET /api/stock/:symbol/yearly': 'Get yearly data (1 year)',
            'GET /api/stock/:symbol/historical': 'Get historical data with custom period',
            'GET /api/stock/:symbol/nse': 'Get NSE data',
            'POST /api/stocks/compare': 'Compare multiple stocks',
            'GET /api/search': 'Search stocks',
            'GET /api/search/online': 'Search stocks online only',
            'GET /api/search-quote': 'Search and get quote in one call',
            'GET /api/popular': 'Get popular stocks',
            'DELETE /api/cache/clean': 'Clean expired cache (requires auth)',
            'GET /api/health': 'Health check'
        },
        authentication: {
            note: 'Trading endpoints require authentication. Include "Authorization: Bearer <token>" header.',
            tokenExpiry: '30 minutes for access token, 7 days for refresh token',
            startingBalance: '₹1,000,000 virtual money for new users'
        }
    });
});

// Helper function to initialize user wallet after signup
async function initializeUserWallet(userId, userEmail, userName) {
    try {
        // Add initial balance of ₹1,000,000
        const initialBalance = 1000000;
        await addUserBalance(userId, initialBalance, `Welcome bonus for ${userName || userEmail}`);
        console.log(`💰 Initialized wallet for user ${userId} with ₹${initialBalance}`);
    } catch (error) {
        console.error(`❌ Failed to initialize wallet for user ${userId}:`, error.message);
    }
}

// ================================
// AUTHENTICATION ENDPOINTS
// ================================

// User registration
app.post('/api/auth/signup', asyncHandler(async (req, res) => {
    const { email, password, confirmPassword, fullName } = req.body;

    // Validate required fields
    if (!email || !password || !confirmPassword || !fullName) {
        return res.status(400).json({
            success: false,
            error: 'All fields are required: email, password, confirmPassword, fullName'
        });
    }

    const tokens = await signup({ email, password, confirmPassword, fullName }, req);
    
    // Initialize user wallet with starting balance
    await initializeUserWallet(tokens.user.id, tokens.user.email, tokens.user.fullName);
    
    res.status(201).json({
        success: true,
        message: 'User registered successfully with ₹1,000,000 starting balance',
        data: tokens,
        timestamp: new Date().toISOString()
    });
}));

// User login
app.post('/api/auth/signin', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            error: 'Email and password are required'
        });
    }

    const tokens = await signin({ email, password }, req);
    
    res.json({
        success: true,
        message: 'User logged in successfully',
        data: tokens,
        timestamp: new Date().toISOString()
    });
}));

// Refresh access token
app.post('/api/auth/refresh', asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
        return res.status(400).json({
            success: false,
            error: 'Refresh token is required'
        });
    }

    const tokens = await refreshToken(refresh_token);
    
    res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: tokens,
        timestamp: new Date().toISOString()
    });
}));

// User logout (requires authentication)
app.post('/api/auth/logout', authenticate(), asyncHandler(async (req, res) => {
    await logout(req.token);
    
    res.json({
        success: true,
        message: 'User logged out successfully',
        timestamp: new Date().toISOString()
    });
}));

// Get current user info (requires authentication)
app.get('/api/auth/me', authenticate(), asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: req.user,
        timestamp: new Date().toISOString()
    });
}));

// Simplified signup endpoint
app.post('/api/auth/signup-simple', asyncHandler(async (req, res) => {
    const { email, password, confirmPassword, fullName } = req.body;

    // Validate required fields
    if (!email || !password || !confirmPassword || !fullName) {
        return res.status(400).json({
            success: false,
            message: 'All fields are required: email, password, confirmPassword, fullName'
        });
    }

    try {
        const result = await signup({ email, password, confirmPassword, fullName }, req);
        
        // Initialize user wallet with starting balance
        await initializeUserWallet(result.user.id, result.user.email, result.user.fullName);
        
        // Return a flatter structure for easier parsing
        res.status(201).json({
            success: true,
            message: 'User registered successfully with ₹1,000,000 starting balance',
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            user_id: result.user.id.toString(),
            user_email: result.user.email,
            user_fullName: result.user.fullName,
            starting_balance: 1000000,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}));

// Simplified signin endpoint
app.post('/api/auth/signin-simple', asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: 'Email and password are required'
        });
    }

    try {
        const result = await signin({ email, password }, req);
        
        // Get user data separately since it's not included in signin result
        const { AuthManager } = require('./auth');
        const authManager = new AuthManager();
        await authManager.db.initDb(); // Ensure database is ready
        const user = await authManager.db.getUserByEmail(email);
        
        // Return a flatter structure for easier parsing
        res.json({
            success: true,
            message: 'User logged in successfully',
            access_token: result.access_token,
            refresh_token: result.refresh_token,
            user_id: user.id.toString(),
            user_email: user.email,
            user_fullName: user.full_name,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
}));

// ================================
// USER TRADING ENDPOINTS (Protected)
// ================================

// Get user wallet balance and details
app.get('/api/user/wallet', authenticate(), asyncHandler(async (req, res) => {
    const result = await getUserWallet(req.user.id);
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Add money to wallet (Deposit)
app.post('/api/user/wallet/deposit', authenticate(), asyncHandler(async (req, res) => {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Amount is required and must be greater than 0',
            timestamp: new Date().toISOString()
        });
    }
    
    const result = await addUserBalance(req.user.id, parseFloat(amount), description);
    
    if (result.success) {
        res.json({
            success: true,
            message: result.message,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Withdraw money from wallet
app.post('/api/user/wallet/withdraw', authenticate(), asyncHandler(async (req, res) => {
    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Amount is required and must be greater than 0',
            timestamp: new Date().toISOString()
        });
    }
    
    const result = await removeUserBalance(req.user.id, parseFloat(amount), description);
    
    if (result.success) {
        res.json({
            success: true,
            message: result.message,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Buy stocks
app.post('/api/user/stocks/buy', authenticate(), asyncHandler(async (req, res) => {
    const { symbol, quantity, pricePerShare } = req.body;
    
    if (!symbol || !quantity) {
        return res.status(400).json({
            success: false,
            error: 'Symbol and quantity are required',
            timestamp: new Date().toISOString()
        });
    }
    
    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Quantity must be greater than 0',
            timestamp: new Date().toISOString()
        });
    }
    
    const result = await buyStock(req.user.id, symbol.toUpperCase(), parseInt(quantity), pricePerShare ? parseFloat(pricePerShare) : null);
    
    if (result.success) {
        res.json({
            success: true,
            message: result.message,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Sell stocks
app.post('/api/user/stocks/sell', authenticate(), asyncHandler(async (req, res) => {
    const { symbol, quantity, pricePerShare } = req.body;
    
    if (!symbol || !quantity) {
        return res.status(400).json({
            success: false,
            error: 'Symbol and quantity are required',
            timestamp: new Date().toISOString()
        });
    }
    
    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Quantity must be greater than 0',
            timestamp: new Date().toISOString()
        });
    }
    
    const result = await sellStock(req.user.id, symbol.toUpperCase(), parseInt(quantity), pricePerShare ? parseFloat(pricePerShare) : null);
    
    if (result.success) {
        res.json({
            success: true,
            message: result.message,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Get user portfolio
app.get('/api/user/portfolio', authenticate(), asyncHandler(async (req, res) => {
    const { updatePrices = 'true' } = req.query;
    const shouldUpdatePrices = updatePrices !== 'false';
    
    const result = await getUserPortfolio(req.user.id, shouldUpdatePrices);
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Get stock transaction history
app.get('/api/user/transactions', authenticate(), asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await getTransactionHistory(req.user.id, parseInt(limit), parseInt(offset));
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            },
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Get wallet transaction history
app.get('/api/user/wallet/transactions', authenticate(), asyncHandler(async (req, res) => {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await getWalletTransactionHistory(req.user.id, parseInt(limit), parseInt(offset));
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            },
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Get complete financial summary
app.get('/api/user/summary', authenticate(), asyncHandler(async (req, res) => {
    const result = await getUserFinancialSummary(req.user.id);
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// Check if user can afford stock purchase
app.post('/api/user/stocks/check-affordability', authenticate(), asyncHandler(async (req, res) => {
    const { symbol, quantity, pricePerShare } = req.body;
    
    if (!symbol || !quantity) {
        return res.status(400).json({
            success: false,
            error: 'Symbol and quantity are required',
            timestamp: new Date().toISOString()
        });
    }
    
    if (quantity <= 0) {
        return res.status(400).json({
            success: false,
            error: 'Quantity must be greater than 0',
            timestamp: new Date().toISOString()
        });
    }
    
    const result = await canAffordStock(req.user.id, symbol.toUpperCase(), parseInt(quantity), pricePerShare ? parseFloat(pricePerShare) : null);
    
    if (result.success) {
        res.json({
            success: true,
            data: result.data,
            timestamp: new Date().toISOString()
        });
    } else {
        res.status(400).json({
            success: false,
            error: result.error,
            timestamp: new Date().toISOString()
        });
    }
}));

// ================================
// CORE STOCK DATA ENDPOINTS
// ================================

// Get basic stock data
app.get('/api/stock/:symbol', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getSimpleStockData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get enhanced stock quote with change calculations
app.get('/api/stock/:symbol/quote', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getEnhancedQuote(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get detailed stock information
app.get('/api/stock/:symbol/details', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getStockDetails(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get NSE data
app.get('/api/stock/:symbol/nse', asyncHandler(async (req, res) => {
    const { symbol } = req.params;

    const data = await getNSEData(symbol.toUpperCase());
    res.json({
        success: true,
        data,
        source: 'NSE API',
        timestamp: new Date().toISOString()
    });
}));

// ================================
// HISTORICAL DATA ENDPOINTS
// ================================

// Get intraday data (1 day, 1-minute intervals)
app.get('/api/stock/:symbol/intraday', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getIntradayData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get weekly data (5 days, 5-minute intervals)
app.get('/api/stock/:symbol/weekly', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getWeeklyData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get monthly data (1 month, daily intervals)
app.get('/api/stock/:symbol/monthly', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getMonthlyData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get quarterly data (3 months, daily intervals)
app.get('/api/stock/:symbol/quarterly', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getQuarterlyData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get yearly data (1 year, weekly intervals)
app.get('/api/stock/:symbol/yearly', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getYearlyData(symbol.toUpperCase(), useCache);
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Get custom historical data
app.get('/api/stock/:symbol/historical', asyncHandler(async (req, res) => {
    const { symbol } = req.params;
    const { period = '1mo', interval = '1d', cache = 'true' } = req.query;
    const useCache = cache !== 'false';

    const data = await getHistoricalData(symbol.toUpperCase(), period, interval, useCache);
    res.json({
        success: true,
        data,
        parameters: { period, interval },
        timestamp: new Date().toISOString()
    });
}));

// ================================
// COMPARISON AND ANALYSIS ENDPOINTS
// ================================

// Compare multiple stocks
app.post('/api/stocks/compare', asyncHandler(async (req, res) => {
    const { symbols, cache = true } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({
            success: false,
            error: 'Please provide an array of symbols to compare'
        });
    }

    if (symbols.length > 10) {
        return res.status(400).json({
            success: false,
            error: 'Maximum 10 symbols allowed for comparison'
        });
    }

    const upperSymbols = symbols.map(s => s.toUpperCase());
    const data = await compareStocks(upperSymbols, cache);
    
    res.json({
        success: true,
        data,
        symbolsCompared: upperSymbols.length,
        timestamp: new Date().toISOString()
    });
}));

// ================================
// SEARCH ENDPOINTS
// ================================

// Search stocks
app.get('/api/search', asyncHandler(async (req, res) => {
    const { q: query, limit = 10, online = 'true' } = req.query;

    if (!query) {
        return res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
        });
    }

    const useOnline = online !== 'false';
    const data = await searchStocks(query, parseInt(limit), useOnline);
    
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// Search stocks online only
app.get('/api/search/online', asyncHandler(async (req, res) => {
    const { q: query, limit = 10 } = req.query;

    if (!query) {
        return res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
        });
    }

    const data = await searchOnlineStocks(query, parseInt(limit));
    
    res.json({
        success: true,
        data: {
            query,
            resultsCount: data.length,
            source: 'Online',
            results: data
        },
        timestamp: new Date().toISOString()
    });
}));

// Search and get quote in one call
app.get('/api/search-quote', asyncHandler(async (req, res) => {
    const { q: query, cache = 'true' } = req.query;

    if (!query) {
        return res.status(400).json({
            success: false,
            error: 'Query parameter "q" is required'
        });
    }

    const useCache = cache !== 'false';
    const data = await searchAndQuote(query, useCache);
    
    res.json({
        success: true,
        data,
        timestamp: new Date().toISOString()
    });
}));

// ================================
// POPULAR STOCKS ENDPOINTS
// ================================

// Get popular stocks
app.get('/api/popular', asyncHandler(async (req, res) => {
    const { category = 'nifty50', limit = 10 } = req.query;

    const data = await getPopularStocks(category, parseInt(limit));
    
    res.json({
        success: true,
        data: {
            category,
            count: data.length,
            stocks: data
        },
        timestamp: new Date().toISOString()
    });
}));

// ================================
// CACHE MANAGEMENT ENDPOINTS (Protected)
// ================================

// Clean expired cache (now requires authentication)
app.delete('/api/cache/clean', authenticate(), asyncHandler(async (req, res) => {
    const data = await cleanExpiredCache();
    
    res.json({
        success: true,
        data,
        message: 'Cache cleanup completed',
        timestamp: new Date().toISOString()
    });
}));

// ================================
// HEALTH CHECK ENDPOINT
// ================================

app.get('/api/health', asyncHandler(async (req, res) => {
    // Perform a simple health check
    try {
        // Test database connection and a simple query
        const testData = await getPopularStocks('nifty50', 1);
        
        res.json({
            success: true,
            status: 'healthy',
            database: 'connected',
            cache: 'operational',
            authentication: 'available',
            trading: 'operational',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            testQuery: testData.length > 0 ? 'passed' : 'no data'
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}));

// ================================
// ERROR HANDLING MIDDLEWARE
// ================================

// Handle 404
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Global error handler
app.use((error, req, res, next) => {
    console.error('API Error:', error);
    
    // Handle authentication errors
    if (error.message.includes('Could not validate credentials') || 
        error.message.includes('No bearer token provided') ||
        error.message.includes('Token has been revoked')) {
        return res.status(401).json({
            success: false,
            error: 'Authentication failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }

    // Handle validation errors
    if (error.message.includes('Invalid email') || 
        error.message.includes('Password must') ||
        error.message.includes('Email already registered') ||
        error.message.includes('Passwords do not match')) {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }

    // Handle account lockout
    if (error.message.includes('Account temporarily locked')) {
        return res.status(429).json({
            success: false,
            error: 'Account locked',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
    
    // Handle specific stock API error types
    if (error.message.includes('All endpoints failed')) {
        return res.status(503).json({
            success: false,
            error: 'Stock data temporarily unavailable',
            symbol: req.params.symbol,
            timestamp: new Date().toISOString()
        });
    }
    
    if (error.message.includes('No stock found')) {
        return res.status(404).json({
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
    
    // Default error response
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
        timestamp: new Date().toISOString()
    });
});

// ================================
// SERVER STARTUP AND CLEANUP
// ================================

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    try {
        await closeDatabase();
        await closeUserDatabase();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    try {
        await closeDatabase();
        await closeUserDatabase();
        process.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
    }
});

// Auto cleanup every hour
setInterval(async () => {
    try {
        await autoCleanup();
    } catch (error) {
        console.error('Auto cleanup failed:', error);
    }
}, 60 * 60 * 1000); // 1 hour

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Stock API Server with Authentication & Trading running on port ${PORT}`);
    console.log(`📊 API Documentation available at http://localhost:${PORT}/`);
    console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Authentication endpoints: http://localhost:${PORT}/api/auth/*`);
    console.log(`💰 Trading endpoints: http://localhost:${PORT}/api/user/*`);
    console.log(`💸 New users start with ₹1,000,000 virtual money`);
    
    // Run initial cleanup
    autoCleanup().catch(console.error);
});

module.exports = app;