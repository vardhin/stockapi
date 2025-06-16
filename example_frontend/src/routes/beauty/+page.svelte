<script>
  import { onMount } from 'svelte';
  import { 
    Home, 
    TrendingUp, 
    Heart, 
    Calendar, 
    User, 
    LogOut, 
    Search, 
    X, 
    Plus, 
    ShoppingCart, 
    Trash2, 
    Circle, 
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Eye,
    EyeOff
  } from 'lucide-svelte';
  
  const API_BASE = 'http://localhost:3000/api';
  
  // Authentication state
  let isAuthenticated = false;
  let accessToken = '';
  let user = null;
  let showAuthModal = false;
  let authMode = 'signin'; // 'signin' or 'signup'
  let authLoading = false;
  
  // Auth form data
  let authForm = {
    email: '',
    password: '',
    confirmPassword: '',
    fullName: ''
  };
  
  // App state variables
  let marketIndices = [];
  let topGainers = [];
  let topLosers = [];
  let myWatchlist = [];
  let watchlistQuotes = {};
  let trendingStocks = [];
  let marketStatus = 'OPEN';
  let lastUpdated = new Date();
  let loading = {};
  let selectedTab = 'markets'; // portfolio, watchlist, markets, orders, profile
  let searchQuery = '';
  let searchResults = [];
  let showSearch = false;
  
  // Portfolio and wallet data
  let portfolio = null;
  let wallet = null;
  let portfolioValue = 0;
  let totalPnL = 0;
  let totalPnLPercent = 0;
  let hideBalance = false;
  
  // Orders data
  let orders = [];
  
  // Quick actions
  let showQuickBuy = false;
  let quickBuySymbol = '';
  let quickBuyQuantity = 1;
  let quickBuyPrice = 0;
  
  // Format functions
  function formatPrice(price) {
    return typeof price === 'number' ? price.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) : 'N/A';
  }
  
  function formatPercent(percent) {
    return typeof percent === 'number' ? percent.toFixed(2) + '%' : 'N/A';
  }
  
  function formatChange(change) {
    if (typeof change !== 'number') return 'N/A';
    return change >= 0 ? `+${change.toFixed(2)}` : change.toFixed(2);
  }
  
  function formatVolume(volume) {
    if (typeof volume !== 'number') return 'N/A';
    if (volume >= 10000000) return (volume / 10000000).toFixed(1) + 'Cr';
    if (volume >= 100000) return (volume / 100000).toFixed(1) + 'L';
    if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
    return volume.toString();
  }
  
  function formatCurrency(amount) {
    if (typeof amount !== 'number') return '₹0.00';
    return '₹' + amount.toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }
  
  // API call utility with auth
  async function apiCall(endpoint, options = {}) {
    const loadingKey = endpoint;
    loading[loadingKey] = true;
    loading = { ...loading };
    
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      };
      
      if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
      }
      
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || data.error || 'API call failed');
      }
      
      return data;
    } catch (err) {
      console.error(`Error calling ${endpoint}:`, err);
      
      // Handle auth errors
      if (err.message.includes('Authentication failed') || err.message.includes('Token')) {
        handleLogout();
      }
      
      return { error: err.message };
    } finally {
      loading[loadingKey] = false;
      loading = { ...loading };
    }
  }
  
  // Authentication functions
  async function handleAuth() {
    if (authLoading) return;
    authLoading = true;
    
    try {
      const endpoint = authMode === 'signin' ? '/auth/signin-simple' : '/auth/signup-simple';
      const payload = authMode === 'signin' 
        ? { email: authForm.email, password: authForm.password }
        : authForm;
      
      const response = await apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      if (response.error) {
        throw new Error(response.error);
      }
      
      // Store auth data
      accessToken = response.access_token;
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', response.refresh_token);
      localStorage.setItem('user_id', response.user_id);
      
      user = {
        id: response.user_id,
        email: response.user_email,
        fullName: response.user_fullName
      };
      
      isAuthenticated = true;
      showAuthModal = false;
      
      // Reset form
      authForm = { email: '', password: '', confirmPassword: '', fullName: '' };
      
      // Load user data
      await Promise.all([
        fetchPortfolio(),
        fetchWallet(),
        fetchWatchlistQuotes(),
        fetchOrders()
      ]);
      
    } catch (error) {
      alert('Authentication failed: ' + error.message);
    } finally {
      authLoading = false;
    }
  }
  
  function handleLogout() {
    isAuthenticated = false;
    accessToken = '';
    user = null;
    portfolio = null;
    wallet = null;
    myWatchlist = [];
    watchlistQuotes = {};
    orders = [];
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_id');
    
    selectedTab = 'markets';
  }
  
  // Load stored auth data
  function loadStoredAuth() {
    const token = localStorage.getItem('access_token');
    const userId = localStorage.getItem('user_id');
    
    if (token && userId) {
      accessToken = token;
      isAuthenticated = true;
      user = { id: userId };
      
      // Fetch current user data
      fetchCurrentUser();
    }
  }
  
  async function fetchCurrentUser() {
    const response = await apiCall('/auth/me');
    if (!response.error) {
      user = response.data;
    }
  }
  
  // Portfolio functions
  async function fetchPortfolio() {
    if (!isAuthenticated) return;
    
    const response = await apiCall('/user/portfolio');
    if (!response.error) {
      portfolio = response.data;
      portfolioValue = portfolio.totalCurrentValue || 0;
      totalPnL = portfolio.totalPnL || 0;
      totalPnLPercent = portfolio.totalPnLPercent || 0;
    }
  }
  
  async function fetchWallet() {
    if (!isAuthenticated) return;
    
    const response = await apiCall('/user/wallet');
    if (!response.error) {
      wallet = response.data;
    }
  }
  
  // Orders functions
  async function fetchOrders() {
    if (!isAuthenticated) return;
    
    const response = await apiCall('/user/transactions');
    if (!response.error) {
      orders = response.data.transactions || [];
    }
  }
  
  // Watchlist functions
  async function fetchWatchlistQuotes() {
    if (!isAuthenticated) return;
    
    // Get default watchlist if user doesn't have custom stocks
    if (myWatchlist.length === 0) {
      myWatchlist = ['RELIANCE', 'TCS', 'INFY', 'HDFC'];
    }
    
    for (const symbol of myWatchlist) {
      const quote = await apiCall(`/stock/${symbol}/quote`);
      if (!quote.error) {
        watchlistQuotes[symbol] = quote.data;
      }
    }
    watchlistQuotes = { ...watchlistQuotes };
  }
  
  // Fetch trending stocks
  async function fetchTrendingStocks() {
    const data = await apiCall('/popular');
    if (data.data && data.data.stocks) {
      trendingStocks = data.data.stocks.slice(0, 10);
    }
  }
  
  // Fetch top gainers/losers (using popular as mock data)
  async function fetchTopMovers() {
    const data = await apiCall('/popular');
    if (data.data && data.data.stocks) {
      topGainers = data.data.stocks.slice(0, 8);
      topLosers = data.data.stocks.slice(8, 16);
    }
  }
  
  // Search stocks
  async function searchStocks() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    
    const data = await apiCall(`/search?q=${searchQuery}&limit=8&online=true`);
    if (data.data && data.data.results) {
      searchResults = data.data.results;
    }
  }
  
  // Handle search input
  function handleSearchInput() {
    if (searchQuery.length > 2) {
      searchStocks();
    } else {
      searchResults = [];
    }
  }
  
  // Toggle search
  function toggleSearch() {
    showSearch = !showSearch;
    if (!showSearch) {
      searchQuery = '';
      searchResults = [];
    }
  }
  
  // Add to watchlist
  function addToWatchlist(symbol) {
    if (!myWatchlist.includes(symbol)) {
      myWatchlist = [...myWatchlist, symbol];
      fetchWatchlistQuotes();
    }
    toggleSearch();
  }
  
  // Remove from watchlist
  function removeFromWatchlist(symbol) {
    myWatchlist = myWatchlist.filter(s => s !== symbol);
    delete watchlistQuotes[symbol];
    watchlistQuotes = { ...watchlistQuotes };
  }
  
  // Quick buy functions
  async function showQuickBuyModal(symbol, currentPrice = 0) {
    if (!isAuthenticated) {
      showAuthModal = true;
      return;
    }
    
    quickBuySymbol = symbol;
    quickBuyPrice = currentPrice;
    quickBuyQuantity = 1;
    showQuickBuy = true;
  }
  
  async function executeQuickBuy() {
    if (!quickBuySymbol || quickBuyQuantity <= 0) return;
    
    try {
      const response = await apiCall('/user/stocks/buy', {
        method: 'POST',
        body: JSON.stringify({
          symbol: quickBuySymbol,
          quantity: quickBuyQuantity,
          pricePerShare: quickBuyPrice || undefined
        })
      });
      
      if (!response.error) {
        showQuickBuy = false;
        await Promise.all([fetchPortfolio(), fetchWallet(), fetchOrders()]);
        alert(`Successfully bought ${quickBuyQuantity} shares of ${quickBuySymbol}`);
      } else {
        alert('Purchase failed: ' + response.error);
      }
    } catch (error) {
      alert('Purchase failed: ' + error.message);
    }
  }
  
  onMount(() => {
    // Load stored authentication
    loadStoredAuth();
    
    // Fetch public data
    fetchTrendingStocks();
    fetchTopMovers();
    
    // If authenticated, fetch user data and show home
    if (isAuthenticated) {
      selectedTab = 'home';
      Promise.all([
        fetchPortfolio(),
        fetchWallet(),
        fetchWatchlistQuotes(),
        fetchOrders()
      ]);
    } else {
      selectedTab = 'markets';
    }
    
    // Update timestamps every minute
    const interval = setInterval(() => {
      lastUpdated = new Date();
    }, 60000);
    
    return () => clearInterval(interval);
  });
</script>

<svelte:head>
  <title>TradePro - Stock Trading App</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
</svelte:head>

<div class="mobile-app">
  <!-- Header -->
  <header class="app-header">
    <div class="header-content">
      <div class="header-left">
        <h1 class="app-title">TradePro</h1>
        <div class="market-status">
          <Circle class="status-dot {marketStatus.toLowerCase()}" size={6} />
          <span class="status-text">Market {marketStatus}</span>
        </div>
      </div>
      <div class="header-right">
        <button class="search-toggle" on:click={toggleSearch}>
          <Search size={20} />
        </button>
        {#if isAuthenticated}
          <button class="profile-btn" on:click={() => selectedTab = 'profile'}>
            <User size={20} />
          </button>
        {:else}
          <button class="auth-btn" on:click={() => showAuthModal = true}>
            <User size={20} />
          </button>
        {/if}
      </div>
    </div>
    
    <!-- Balance Banner - Only show on home tab when authenticated -->
    {#if isAuthenticated && wallet && selectedTab === 'home'}
      <div class="balance-banner">
        <div class="balance-header">
          <span class="balance-title">Portfolio Overview</span>
          <button class="balance-toggle" on:click={() => hideBalance = !hideBalance}>
            {#if hideBalance}
              <Eye size={16} />
            {:else}
              <EyeOff size={16} />
            {/if}
          </button>
        </div>
        <div class="balance-grid">
          <div class="balance-item">
            <span class="balance-label">Available Cash</span>
            <span class="balance-value">
              {hideBalance ? '••••••' : formatCurrency(wallet.balance)}
            </span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Invested</span>
            <span class="balance-value">
              {hideBalance ? '••••••' : formatCurrency(portfolioValue)}
            </span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Today's P&L</span>
            <span class="balance-value {totalPnL >= 0 ? 'positive' : 'negative'}">
              {hideBalance ? '••••••' : `${totalPnL >= 0 ? '+' : ''}${formatCurrency(totalPnL)}`}
            </span>
          </div>
          <div class="balance-item">
            <span class="balance-label">Total Value</span>
            <span class="balance-value total">
              {hideBalance ? '••••••' : formatCurrency((wallet?.balance || 0) + portfolioValue)}
            </span>
          </div>
        </div>
      </div>
    {/if}
    
    <!-- Search Bar -->
    {#if showSearch}
      <div class="search-container">
        <div class="search-bar">
          <Search class="search-icon" size={16} />
          <input 
            type="text" 
            placeholder="Search stocks..."
            bind:value={searchQuery}
            on:input={handleSearchInput}
            class="search-input"
            autofocus
          />
          <button class="search-close" on:click={toggleSearch}>
            <X size={20} />
          </button>
        </div>
        
        {#if searchResults.length > 0}
          <div class="search-results">
            {#each searchResults as result}
              <button 
                class="search-result" 
                on:click={() => isAuthenticated ? showQuickBuyModal(result.symbol) : addToWatchlist(result.symbol)}
              >
                <div class="result-info">
                  <span class="result-symbol">{result.symbol}</span>
                  <span class="result-name">{result.name || result.long_name || 'N/A'}</span>
                </div>
                <div class="result-actions">
                  <span class="result-exchange">{result.exchange || ''}</span>
                  <Plus class="result-icon" size={16} />
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </header>

  <!-- Main Content -->
  <main class="main-content">
    <!-- Market Overview Cards - Show on markets and home -->
    {#if selectedTab === 'markets' || selectedTab === 'home'}
      <section class="market-overview">
        <div class="overview-cards">
          <div class="overview-card nifty">
            <div class="card-header">
              <div class="index-info">
                <span class="index-name">NIFTY 50</span>
                <span class="index-value">19,842.75</span>
              </div>
              <div class="index-changes">
                <span class="index-change positive">+234.80</span>
                <span class="index-change-percent positive">+1.2%</span>
              </div>
            </div>
          </div>
          
          <div class="overview-card sensex">
            <div class="card-header">
              <div class="index-info">
                <span class="index-name">SENSEX</span>
                <span class="index-value">66,795.14</span>
              </div>
              <div class="index-changes">
                <span class="index-change positive">+528.90</span>
                <span class="index-change-percent positive">+0.8%</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    {/if}

    <!-- Stock Lists -->
    <section class="stock-lists">
      {#if selectedTab === 'home' && isAuthenticated}
        <div class="list-header">
          <h2>Holdings</h2>
          <span class="list-count">{portfolio?.holdings?.length || 0} stocks</span>
        </div>
        {#if portfolio && portfolio.holdings && portfolio.holdings.length > 0}
          <div class="stock-list">
            {#each portfolio.holdings as holding}
              <div class="stock-item portfolio-item">
                <div class="stock-info">
                  <div class="stock-symbol">{holding.symbol}</div>
                  <div class="stock-meta">
                    <span class="stock-quantity">{holding.quantity} shares</span>
                    <span class="avg-price">Avg: {formatCurrency(holding.avgPrice)}</span>
                  </div>
                </div>
                <div class="stock-values">
                  <div class="current-value">
                    <span class="value">{formatCurrency(holding.currentValue)}</span>
                    <span class="current-price">{formatCurrency(holding.currentPrice)}</span>
                  </div>
                  <div class="pnl {(holding.currentValue - holding.totalCost) >= 0 ? 'positive' : 'negative'}">
                    <ArrowUpRight size={12} class="pnl-icon" />
                    <span class="pnl-amount">{formatCurrency(Math.abs(holding.currentValue - holding.totalCost))}</span>
                    <span class="pnl-percent">({formatPercent(Math.abs(((holding.currentValue - holding.totalCost) / holding.totalCost) * 100))})</span>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">
              <TrendingUp size={48} />
            </div>
            <h3>Start Your Investment Journey</h3>
            <p>Buy your first stock to build your portfolio</p>
            <button class="cta-button" on:click={() => selectedTab = 'markets'}>
              Explore Markets
            </button>
          </div>
        {/if}
      {/if}

      {#if selectedTab === 'watchlist'}
        <div class="list-header">
          <h2>Watchlist</h2>
          <span class="list-count">{myWatchlist.length} stocks</span>
        </div>
        {#if myWatchlist.length > 0}
          <div class="stock-list">
            {#each myWatchlist as symbol}
              {#if watchlistQuotes[symbol]}
                <div class="stock-item">
                  <div class="stock-info">
                    <div class="stock-symbol">{symbol}</div>
                    <div class="stock-name">{watchlistQuotes[symbol].symbol}</div>
                  </div>
                  <div class="stock-price">
                    <div class="current-price">{formatCurrency(watchlistQuotes[symbol].currentPrice)}</div>
                    <div class="price-change {watchlistQuotes[symbol].change >= 0 ? 'positive' : 'negative'}">
                      {formatChange(watchlistQuotes[symbol].change)} ({formatPercent(watchlistQuotes[symbol].changePercent)})
                    </div>
                  </div>
                  <div class="stock-actions">
                    {#if isAuthenticated}
                      <button class="action-btn buy-btn" on:click={() => showQuickBuyModal(symbol, watchlistQuotes[symbol].currentPrice)}>
                        <ShoppingCart size={16} />
                      </button>
                    {/if}
                    <button class="action-btn remove-btn" on:click={() => removeFromWatchlist(symbol)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              {/if}
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">
              <Heart size={48} />
            </div>
            <h3>Build Your Watchlist</h3>
            <p>Track stocks you're interested in</p>
            <button class="cta-button" on:click={toggleSearch}>
              Search Stocks
            </button>
          </div>
        {/if}
      {/if}

      {#if selectedTab === 'markets'}
        <div class="list-header">
          <h2>Trending Stocks</h2>
          <span class="list-count">{trendingStocks.length} stocks</span>
        </div>
        <div class="stock-list">
          {#each trendingStocks as stock}
            <div class="stock-item">
              <div class="stock-info">
                <div class="stock-symbol">{stock.symbol}</div>
                <div class="stock-name">{stock.name || 'N/A'}</div>
              </div>
              <div class="stock-price">
                <div class="current-price">{formatCurrency(Math.random() * 3000 + 100)}</div>
                <div class="price-change {Math.random() > 0.5 ? 'positive' : 'negative'}">
                  {Math.random() > 0.5 ? '+' : '-'}{(Math.random() * 5).toFixed(2)}%
                </div>
              </div>
              <div class="stock-actions">
                {#if isAuthenticated}
                  <button class="action-btn buy-btn" on:click={() => showQuickBuyModal(stock.symbol, Math.random() * 3000 + 100)}>
                    <ShoppingCart size={16} />
                  </button>
                {/if}
                <button class="action-btn add-btn" on:click={() => addToWatchlist(stock.symbol)}>
                  <Plus size={16} />
                </button>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      {#if selectedTab === 'orders' && isAuthenticated}
        <div class="list-header">
          <h2>Order History</h2>
          <span class="list-count">{orders.length} orders</span>
        </div>
        {#if orders.length > 0}
          <div class="stock-list">
            {#each orders as order}
              <div class="stock-item order-item">
                <div class="stock-info">
                  <div class="stock-symbol">{order.symbol}</div>
                  <div class="order-meta">
                    <span class="order-type {order.transactionType.toLowerCase()}">{order.transactionType}</span>
                    <span class="order-date">{new Date(order.transactionDate).toLocaleDateString()}</span>
                  </div>
                </div>
                <div class="order-details">
                  <div class="order-value">{formatCurrency(order.totalAmount)}</div>
                  <div class="order-quantity">{order.quantity} shares @ {formatCurrency(order.price)}</div>
                </div>
              </div>
            {/each}
          </div>
        {:else}
          <div class="empty-state">
            <div class="empty-icon">
              <Calendar size={48} />
            </div>
            <h3>No Orders Yet</h3>
            <p>Your trading history will appear here</p>
          </div>
        {/if}
      {/if}

      {#if selectedTab === 'profile' && isAuthenticated}
        <div class="profile-section">
          <div class="profile-header">
            <div class="profile-avatar">
              <User size={32} />
            </div>
            <div class="profile-info">
              <h2 class="profile-name">{user?.fullName || user?.email || 'User'}</h2>
              <p class="profile-email">{user?.email}</p>
            </div>
          </div>

          <div class="profile-stats">
            <div class="stat-card">
              <span class="stat-value">{formatCurrency((wallet?.balance || 0) + portfolioValue)}</span>
              <span class="stat-label">Total Value</span>
            </div>
            <div class="stat-card">
              <span class="stat-value {totalPnL >= 0 ? 'positive' : 'negative'}">
                {formatCurrency(totalPnL)}
              </span>
              <span class="stat-label">Today's P&L</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{portfolio?.holdings?.length || 0}</span>
              <span class="stat-label">Holdings</span>
            </div>
          </div>

          <div class="profile-actions">
            <button class="profile-action-btn" on:click={() => selectedTab = 'orders'}>
              <Calendar size={20} />
              <span>Order History</span>
            </button>
            <button class="profile-action-btn" on:click={() => selectedTab = 'watchlist'}>
              <Heart size={20} />
              <span>Watchlist</span>
            </button>
            <button class="profile-action-btn logout" on:click={handleLogout}>
              <LogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      {/if}
    </section>
  </main>

  <!-- Authentication Modal -->
  {#if showAuthModal}
    <div class="modal-overlay" on:click|self={() => showAuthModal = false}>
      <div class="auth-modal">
        <div class="modal-header">
          <h2>{authMode === 'signin' ? 'Welcome Back' : 'Create Account'}</h2>
          <button class="modal-close" on:click={() => showAuthModal = false}>
            <X size={24} />
          </button>
        </div>
        
        <form on:submit|preventDefault={handleAuth} class="auth-form">
          {#if authMode === 'signup'}
            <div class="form-group">
              <input
                type="text"
                placeholder="Full Name"
                bind:value={authForm.fullName}
                required
                class="form-input"
              />
            </div>
          {/if}
          
          <div class="form-group">
            <input
              type="email"
              placeholder="Email"
              bind:value={authForm.email}
              required
              class="form-input"
            />
          </div>
          
          <div class="form-group">
            <input
              type="password"
              placeholder="Password"
              bind:value={authForm.password}
              required
              class="form-input"
            />
          </div>
          
          {#if authMode === 'signup'}
            <div class="form-group">
              <input
                type="password"
                placeholder="Confirm Password"
                bind:value={authForm.confirmPassword}
                required
                class="form-input"
              />
            </div>
          {/if}
          
          <button type="submit" class="auth-submit" disabled={authLoading}>
            {authLoading ? 'Please wait...' : (authMode === 'signin' ? 'Sign In' : 'Create Account')}
          </button>
        </form>
        
        <div class="auth-switch">
          {#if authMode === 'signin'}
            Don't have an account? 
            <button class="switch-btn" on:click={() => authMode = 'signup'}>Sign up</button>
          {:else}
            Already have an account? 
            <button class="switch-btn" on:click={() => authMode = 'signin'}>Sign in</button>
          {/if}
        </div>
        
        {#if authMode === 'signup'}
          <div class="signup-bonus">
            🎉 Get ₹10,00,000 virtual money to start trading!
          </div>
        {/if}
      </div>
    </div>
  {/if}

  <!-- Quick Buy Modal -->
  {#if showQuickBuy}
    <div class="modal-overlay" on:click|self={() => showQuickBuy = false}>
      <div class="quick-buy-modal">
        <div class="modal-header">
          <h2>Buy {quickBuySymbol}</h2>
          <button class="modal-close" on:click={() => showQuickBuy = false}>
            <X size={24} />
          </button>
        </div>
        
        <div class="buy-form">
          <div class="price-display">
            <span class="price-label">Current Price</span>
            <span class="price-value">{formatCurrency(quickBuyPrice)}</span>
          </div>
          
          <div class="form-group">
            <label>Quantity</label>
            <input
              type="number"
              min="1"
              bind:value={quickBuyQuantity}
              class="form-input"
            />
          </div>
          
          <div class="total-cost">
            <span class="cost-label">Total Cost</span>
            <span class="cost-value">{formatCurrency(quickBuyPrice * quickBuyQuantity)}</span>
          </div>
          
          <div class="buy-actions">
            <button class="cancel-btn" on:click={() => showQuickBuy = false}>Cancel</button>
            <button class="confirm-buy-btn" on:click={executeQuickBuy}>Buy Shares</button>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Bottom Navigation -->
  <nav class="bottom-nav">
    <button class="nav-item {selectedTab === 'home' ? 'active' : ''}" 
            on:click={() => selectedTab = isAuthenticated ? 'home' : 'markets'}>
      <Home size={20} />
      <span>Home</span>
    </button>
    <button class="nav-item {selectedTab === 'markets' ? 'active' : ''}" 
            on:click={() => selectedTab = 'markets'}>
      <TrendingUp size={20} />
      <span>Markets</span>
    </button>
    <button class="nav-item {selectedTab === 'watchlist' ? 'active' : ''}" 
            on:click={() => selectedTab = 'watchlist'}>
      <Heart size={20} />
      <span>Watchlist</span>
    </button>
    {#if isAuthenticated}
      <button class="nav-item {selectedTab === 'orders' ? 'active' : ''}" 
              on:click={() => selectedTab = 'orders'}>
        <Calendar size={20} />
        <span>Orders</span>
      </button>
      <button class="nav-item {selectedTab === 'profile' ? 'active' : ''}" 
              on:click={() => selectedTab = 'profile'}>
        <User size={20} />
        <span>Profile</span>
      </button>
    {:else}
      <button class="nav-item" on:click={() => showAuthModal = true}>
        <User size={20} />
        <span>Sign In</span>
      </button>
    {/if}
  </nav>
</div>

<style>
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  
  .mobile-app {
    max-width: 414px;
    margin: 0 auto;
    height: 100vh;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'SF Pro Display', sans-serif;
    overflow: hidden;
    position: relative;
  }
  
  /* Header Styles */
  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  }
  
  .header-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .header-left {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .app-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
  }
  
  .market-status {
    display: flex;
    align-items: center;
    gap: 6px;
    opacity: 0.9;
  }
  
  .status-dot.open {
    color: #10b981;
  }
  
  .status-dot.closed {
    color: #ef4444;
  }
  
  .status-text {
    font-size: 0.75rem;
    text-transform: uppercase;
    font-weight: 500;
  }
  
  .header-right {
    display: flex;
    gap: 12px;
  }
  
  .search-toggle, .profile-btn, .auth-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
    color: white;
    backdrop-filter: blur(10px);
  }
  
  .search-toggle:hover, .profile-btn:hover, .auth-btn:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }
  
  /* Balance Banner */
  .balance-banner {
    background: rgba(255, 255, 255, 0.15);
    border-radius: 16px;
    padding: 16px;
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  
  .balance-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  .balance-title {
    font-size: 14px;
    font-weight: 600;
    opacity: 0.9;
  }
  
  .balance-toggle {
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: background 0.2s;
  }
  
  .balance-toggle:hover {
    background: rgba(255, 255, 255, 0.2);
  }
  
  .balance-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  
  .balance-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .balance-label {
    font-size: 11px;
    opacity: 0.8;
    text-transform: uppercase;
    font-weight: 500;
  }
  
  .balance-value {
    font-size: 14px;
    font-weight: 700;
  }
  
  .balance-value.total {
    font-size: 16px;
  }
  
  .balance-value.positive {
    color: #10b981;
  }
  
  .balance-value.negative {
    color: #ef4444;
  }
  
  /* Search Styles */
  .search-container {
    margin-top: 16px;
  }
  
  .search-bar {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 16px;
    padding: 12px 16px;
    gap: 10px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  }
  
  .search-icon {
    color: #6b7280;
  }
  
  .search-input {
    flex: 1;
    border: none;
    background: none;
    outline: none;
    font-size: 16px;
    color: #1f2937;
    font-weight: 500;
  }
  
  .search-close {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: background 0.2s;
  }
  
  .search-close:hover {
    background: #f3f4f6;
  }
  
  .search-results {
    background: white;
    border-radius: 12px;
    margin-top: 8px;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
    max-height: 200px;
    overflow-y: auto;
  }
  
  .search-result {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    border: none;
    background: none;
    cursor: pointer;
    border-bottom: 1px solid #f1f5f9;
    text-align: left;
    transition: background 0.2s;
  }
  
  .search-result:hover {
    background: #f8fafc;
  }
  
  .search-result:last-child {
    border-bottom: none;
  }
  
  .result-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .result-symbol {
    font-weight: 700;
    color: #1e293b;
    font-size: 15px;
  }
  
  .result-name {
    font-size: 13px;
    color: #64748b;
  }
  
  .result-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .result-exchange {
    font-size: 11px;
    color: #94a3b8;
    font-weight: 500;
  }
  
  .result-icon {
    color: #667eea;
  }
  
  /* Main Content */
  .main-content {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 80px;
  }
  
  /* Market Overview */
  .market-overview {
    padding: 20px;
  }
  
  .overview-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  
  .overview-card {
    background: white;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
    border: 1px solid #f1f5f9;
  }
  
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  
  .index-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .index-name {
    font-size: 13px;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
  }
  
  .index-value {
    font-size: 18px;
    font-weight: 800;
    color: #1e293b;
  }
  
  .index-changes {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
  }
  
  .index-change {
    font-size: 12px;
    font-weight: 600;
  }
  
  .index-change-percent {
    font-size: 11px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 6px;
  }
  
  .index-change.positive, .index-change-percent.positive {
    color: #10b981;
    background: #d1fae5;
  }
  
  .index-change.negative, .index-change-percent.negative {
    color: #ef4444;
    background: #fee2e2;
  }
  
  /* Stock Lists */
  .stock-lists {
    background: white;
    flex: 1;
  }
  
  .list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid #f1f5f9;
    background: white;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  
  .list-header h2 {
    font-size: 20px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .list-count {
    font-size: 13px;
    color: #64748b;
    font-weight: 500;
  }
  
  .stock-list {
    max-height: calc(100vh - 300px);
    overflow-y: auto;
  }
  
  .stock-item {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #f8fafc;
    gap: 16px;
    transition: background 0.2s;
  }
  
  .stock-item:hover {
    background: #f8fafc;
  }
  
  .portfolio-item {
    padding: 20px;
    border-bottom: 1px solid #f1f5f9;
  }
  
  .stock-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  
  .stock-symbol {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .stock-name {
    font-size: 14px;
    color: #64748b;
  }
  
  .stock-meta {
    display: flex;
    gap: 12px;
    font-size: 12px;
    color: #64748b;
  }
  
  .stock-quantity, .avg-price {
    font-weight: 500;
  }
  
  .stock-price {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  
  .current-price {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .price-change {
    font-size: 13px;
    font-weight: 600;
  }
  
  .price-change.positive {
    color: #10b981;
  }
  
  .price-change.negative {
    color: #ef4444;
  }
  
  .stock-values {
    text-align: right;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .current-value {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .value {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .current-price {
    font-size: 13px;
    color: #64748b;
  }
  
  .pnl {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    font-weight: 600;
  }
  
  .pnl.positive {
    color: #10b981;
  }
  
  .pnl.negative {
    color: #ef4444;
  }
  
  .pnl-icon {
    width: 12px;
    height: 12px;
  }
  
  .stock-actions {
    display: flex;
    gap: 8px;
  }
  
  .action-btn {
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .buy-btn {
    background: #10b981;
    color: white;
  }
  
  .buy-btn:hover {
    background: #059669;
    transform: scale(1.05);
  }
  
  .add-btn {
    background: #667eea;
    color: white;
  }
  
  .add-btn:hover {
    background: #5a67d8;
    transform: scale(1.05);
  }
  
  .remove-btn {
    background: #f1f5f9;
    color: #64748b;
  }
  
  .remove-btn:hover {
    background: #ef4444;
    color: white;
    transform: scale(1.05);
  }
  
  /* Empty States */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    text-align: center;
  }
  
  .empty-icon {
    margin-bottom: 20px;
    color: #cbd5e1;
  }
  
  .empty-state h3 {
    font-size: 20px;
    font-weight: 700;
    color: #1e293b;
    margin-bottom: 8px;
  }
  
  .empty-state p {
    font-size: 16px;
    color: #64748b;
    margin-bottom: 24px;
  }
  
  .cta-button {
    background: #667eea;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .cta-button:hover {
    background: #5a67d8;
    transform: translateY(-1px);
  }
  
  /* Profile Section */
  .profile-section {
    padding: 20px;
  }
  
  .profile-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
    padding: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    color: white;
  }
  
  .profile-avatar {
    width: 60px;
    height: 60px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(10px);
  }
  
  .profile-info {
    flex: 1;
  }
  
  .profile-name {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  
  .profile-email {
    font-size: 14px;
    opacity: 0.9;
  }
  
  .profile-stats {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
    margin-bottom: 32px;
  }
  
  .stat-card {
    background: white;
    padding: 20px 16px;
    border-radius: 12px;
    text-align: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    border: 1px solid #f1f5f9;
  }
  
  .stat-value {
    display: block;
    font-size: 18px;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 4px;
  }
  
  .stat-value.positive {
    color: #10b981;
  }
  
  .stat-value.negative {
    color: #ef4444;
  }
  
  .stat-label {
    font-size: 12px;
    color: #64748b;
    text-transform: uppercase;
    font-weight: 600;
  }
  
  .profile-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  
  .profile-action-btn {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    background: white;
    border: 1px solid #f1f5f9;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s;
    color: #1e293b;
    font-size: 16px;
    font-weight: 500;
  }
  
  .profile-action-btn:hover {
    background: #f8fafc;
    transform: translateY(-1px);
  }
  
  .profile-action-btn.logout {
    color: #ef4444;
    border-color: #fee2e2;
  }
  
  .profile-action-btn.logout:hover {
    background: #fee2e2;
  }
  
  /* Order Items */
  .order-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  
  .order-meta {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  
  .order-type {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 4px 8px;
    border-radius: 6px;
  }
  
  .order-type.buy {
    background: #d1fae5;
    color: #10b981;
  }
  
  .order-type.sell {
    background: #fee2e2;
    color: #ef4444;
  }
  
  .order-date {
    font-size: 12px;
    color: #64748b;
  }
  
  .order-details {
    display: flex;
    justify-content: space-between;
    width: 100%;
    align-items: center;
  }
  
  .order-value {
    font-size: 16px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .order-quantity {
    font-size: 13px;
    color: #64748b;
  }
  
  /* Modal Styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
    backdrop-filter: blur(4px);
  }
  
  .auth-modal, .quick-buy-modal {
    background: white;
    border-radius: 20px;
    width: 100%;
    max-width: 400px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
  }
  
  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    border-bottom: 1px solid #f1f5f9;
  }
  
  .modal-header h2 {
    font-size: 24px;
    font-weight: 700;
    color: #1e293b;
  }
  
  .modal-close {
    background: #f8fafc;
    border: none;
    color: #64748b;
    cursor: pointer;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 18px;
    transition: all 0.2s;
  }
  
  .modal-close:hover {
    background: #f1f5f9;
    color: #1e293b;
  }
  
  /* Auth Form */
  .auth-form {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  
  .form-group label {
    font-size: 14px;
    font-weight: 600;
    color: #374151;
  }
  
  .form-input {
    padding: 16px;
    border: 2px solid #f1f5f9;
    border-radius: 12px;
    font-size: 16px;
    transition: border-color 0.2s;
    background: #fafbfc;
  }
  
  .form-input:focus {
    outline: none;
    border-color: #667eea;
    background: white;
  }
  
  .auth-submit {
    background: #667eea;
    color: white;
    border: none;
    padding: 16px 24px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
    margin-top: 8px;
  }
  
  .auth-submit:hover:not(:disabled) {
    background: #5a67d8;
    transform: translateY(-1px);
  }
  
  .auth-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
  
  .auth-switch {
    padding: 20px 24px;
    text-align: center;
    font-size: 14px;
    color: #64748b;
    border-top: 1px solid #f1f5f9;
  }
  
  .switch-btn {
    background: none;
    border: none;
    color: #667eea;
    font-weight: 700;
    cursor: pointer;
    text-decoration: underline;
  }
  
  .signup-bonus {
    padding: 16px 24px;
    background: #f0fdf4;
    color: #15803d;
    text-align: center;
    font-size: 14px;
    font-weight: 600;
    border-top: 1px solid #f1f5f9;
  }
  
  /* Quick Buy Modal */
  .buy-form {
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  
  .price-display {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: #f8fafc;
    border-radius: 12px;
    border: 1px solid #f1f5f9;
  }
  
  .price-label {
    font-size: 14px;
    color: #64748b;
    font-weight: 500;
  }
  
  .price-value {
    font-size: 20px;
    font-weight: 800;
    color: #1e293b;
  }
  
  .total-cost {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    background: #f0fdf4;
    border-radius: 12px;
    border: 2px solid #bbf7d0;
  }
  
  .cost-label {
    font-size: 16px;
    color: #15803d;
    font-weight: 600;
  }
  
  .cost-value {
    font-size: 20px;
    font-weight: 800;
    color: #15803d;
  }
  
  .buy-actions {
    display: flex;
    gap: 16px;
  }
  
  .cancel-btn, .confirm-buy-btn {
    flex: 1;
    padding: 16px 24px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .cancel-btn {
    background: #f8fafc;
    color: #64748b;
    border: 2px solid #f1f5f9;
  }
  
  .cancel-btn:hover {
    background: #f1f5f9;
    color: #1e293b;
  }
  
  .confirm-buy-btn {
    background: #10b981;
    color: white;
    border: none;
  }
  
  .confirm-buy-btn:hover {
    background: #059669;
    transform: translateY(-1px);
  }
  
  /* Bottom Navigation */
  .bottom-nav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 100%;
    max-width: 414px;
    background: white;
    border-top: 1px solid #f1f5f9;
    display: flex;
    padding: 8px 0 max(8px, env(safe-area-inset-bottom));
    box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.1);
  }
  
  .nav-item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    background: none;
    border: none;
    padding: 12px 8px;
    cursor: pointer;
    transition: all 0.2s;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
  }
  
  .nav-item.active {
    color: #667eea;
    transform: translateY(-2px);
  }
  
  .nav-item:hover {
    color: #667eea;
  }
  
  /* Responsive for larger mobile screens */
  @media (min-width: 414px) {
    .mobile-app {
      max-width: 414px;
    }
    
    .bottom-nav {
      max-width: 414px;
    }
  }
  
  /* Safari safe area support */
  @supports (padding: max(0px)) {
    .app-header {
      padding-top: max(16px, env(safe-area-inset-top));
    }
    
    .bottom-nav {
      padding-bottom: max(8px, env(safe-area-inset-bottom));
    }
  }
</style>