<script>
  import { onMount } from 'svelte';
  
  const API_BASE = 'http://localhost:3000/api';
  
  // State variables
  let healthData = null;
  let simpleQuote = null;
  let enhancedQuote = null;
  let testData = null;
  let stockDetails = null;
  let historicalData = {};
  let compareData = null;
  let searchResults = null;
  let popularStocks = null;
  let popularByCategory = null;
  let cacheCleanResult = null;
  let searchAndQuoteData = null;
  
  // Input values
  let selectedSymbol = 'RELIANCE';
  let testSymbol = 'TCS';
  let compareSymbols = 'RELIANCE,TCS,INFY';
  let searchQuery = 'reliance';
  let popularCategory = 'nifty50';
  let searchAndQuoteQuery = 'tesla';
  
  // Loading states
  let loading = {};
  
  // Cache bypass options
  let bypassCache = false;
  
  // Utility function to handle API calls
  async function apiCall(endpoint, options = {}) {
    const loadingKey = endpoint;
    loading[loadingKey] = true;
    loading = { ...loading };
    
    try {
      // Add nocache parameter if bypassing cache
      const url = bypassCache && !endpoint.includes('?') 
        ? `${API_BASE}${endpoint}?nocache=true`
        : bypassCache && endpoint.includes('?')
        ? `${API_BASE}${endpoint}&nocache=true`
        : `${API_BASE}${endpoint}`;
        
      const response = await fetch(url, options);
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Error calling ${endpoint}:`, error);
      return { error: error.message };
    } finally {
      loading[loadingKey] = false;
      loading = { ...loading };
    }
  }
  
  // API functions
  async function fetchHealth() {
    healthData = await apiCall('/health');
  }
  
  async function fetchSimpleQuote() {
    simpleQuote = await apiCall(`/simple/${selectedSymbol}`);
  }
  
  async function fetchEnhancedQuote() {
    enhancedQuote = await apiCall(`/stock/${selectedSymbol}/quote`);
  }
  
  async function fetchTestData() {
    testData = await apiCall(`/test/${testSymbol}`);
  }
  
  async function fetchStockDetails() {
    stockDetails = await apiCall(`/stock/${selectedSymbol}/details`);
  }
  
  async function fetchHistoricalData(period) {
    const data = await apiCall(`/stock/${selectedSymbol}/${period}`);
    historicalData[period] = data;
    historicalData = { ...historicalData };
  }
  
  async function fetchCompareStocks() {
    const symbols = compareSymbols.split(',').map(s => s.trim());
    compareData = await apiCall('/stocks/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbols })
    });
  }
  
  async function fetchSearchResults() {
    const onlineParam = '&online=true'; // Enable online search
    searchResults = await apiCall(`/search/${searchQuery}?limit=20${onlineParam}`);
  }
  
  async function fetchPopularStocks() {
    popularStocks = await apiCall('/popular');
  }
  
  async function fetchPopularByCategory() {
    popularByCategory = await apiCall(`/popular/${popularCategory}`);
  }
  
  async function cleanCache() {
    cacheCleanResult = await apiCall('/cache/clean', { method: 'POST' });
  }
  
  // New function for search and quote
  async function fetchSearchAndQuote() {
    searchAndQuoteData = await apiCall(`/search-and-quote/${searchAndQuoteQuery}`);
  }
  
  // Format functions
  function formatPrice(price) {
    return typeof price === 'number' ? price.toFixed(2) : 'N/A';
  }
  
  function formatPercent(percent) {
    return typeof percent === 'number' ? percent.toFixed(2) + '%' : 'N/A';
  }
  
  function formatVolume(volume) {
    if (typeof volume !== 'number') return 'N/A';
    if (volume >= 1000000) return (volume / 1000000).toFixed(2) + 'M';
    if (volume >= 1000) return (volume / 1000).toFixed(2) + 'K';
    return volume.toString();
  }
  
  function formatMarketCap(marketCap) {
    if (typeof marketCap !== 'number') return 'N/A';
    if (marketCap >= 1000000000000) return '₹' + (marketCap / 1000000000000).toFixed(2) + 'T';
    if (marketCap >= 1000000000) return '₹' + (marketCap / 1000000000).toFixed(2) + 'B';
    if (marketCap >= 1000000) return '₹' + (marketCap / 1000000).toFixed(2) + 'M';
    return '₹' + marketCap.toString();
  }
  
  onMount(() => {
    fetchHealth();
  });
</script>

<svelte:head>
  <title>Stock API Frontend Demo</title>
</svelte:head>

<div class="container">
  <header>
    <h1>📊 Stock API Frontend Demo</h1>
    <p>Comprehensive demonstration of all available endpoints with enhanced features</p>
  </header>

  <!-- Global Settings -->
  <section class="api-section settings-section">
    <h2>⚙️ Global Settings</h2>
    <div class="input-group">
      <label class="checkbox-label">
        <input type="checkbox" bind:checked={bypassCache} />
        Bypass Cache (Force fresh data)
      </label>
    </div>
    <p class="note">When enabled, all requests will fetch fresh data instead of using cached results.</p>
  </section>

  <!-- Health Check -->
  <section class="api-section">
    <h2>🏥 Health Check</h2>
    <button on:click={fetchHealth} disabled={loading['/health']}>
      {loading['/health'] ? 'Loading...' : 'Check API Health'}
    </button>
    
    {#if healthData}
      <div class="result-box">
        <h3>Status: {healthData.status}</h3>
        <p><strong>Timestamp:</strong> {healthData.timestamp}</p>
        {#if healthData.features}
          <h4>Features:</h4>
          <div class="features-grid">
            {#each Object.entries(healthData.features) as [key, value]}
              <div class="feature-item">
                <strong>{key}:</strong> {value}
              </div>
            {/each}
          </div>
        {/if}
        {#if healthData.endpoints}
          <h4>Available Endpoints:</h4>
          <div class="endpoints-list">
            {#each healthData.endpoints as endpoint}
              <code class="endpoint">{endpoint}</code>
            {/each}
          </div>
        {/if}
        {#if healthData.notes}
          <h4>Usage Notes:</h4>
          <ul class="notes-list">
            {#each healthData.notes as note}
              <li>{note}</li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Stock Symbol Input -->
  <section class="api-section">
    <h2>🎯 Stock Symbol Selection</h2>
    <div class="input-group">
      <label>
        Primary Symbol:
        <input bind:value={selectedSymbol} placeholder="e.g., RELIANCE" />
      </label>
      <label>
        Test Symbol:
        <input bind:value={testSymbol} placeholder="e.g., TCS" />
      </label>
    </div>
  </section>

  <!-- Search and Quote (New Feature) -->
  <section class="api-section featured">
    <h2>🔍💰 Search & Quote (NEW)</h2>
    <p class="feature-description">Search for a stock and get its live quote in one request</p>
    <div class="input-group">
      <label>
        Search Query:
        <input bind:value={searchAndQuoteQuery} placeholder="e.g., tesla, apple, reliance" />
      </label>
    </div>
    <button on:click={fetchSearchAndQuote} disabled={loading[`/search-and-quote/${searchAndQuoteQuery}`]}>
      {loading[`/search-and-quote/${searchAndQuoteQuery}`] ? 'Loading...' : `Search & Quote for "${searchAndQuoteQuery}"`}
    </button>
    
    {#if searchAndQuoteData}
      <div class="result-box">
        {#if searchAndQuoteData.error}
          <div class="error">Error: {searchAndQuoteData.error}</div>
          {#if searchAndQuoteData.suggestion}
            <p class="suggestion">💡 {searchAndQuoteData.suggestion}</p>
          {/if}
        {:else}
          <div class="search-quote-result">
            <h4>Found: {searchAndQuoteData.foundStock.name}</h4>
            <p class="stock-info">
              <strong>Symbol:</strong> {searchAndQuoteData.foundStock.symbol} | 
              <strong>Exchange:</strong> {searchAndQuoteData.foundStock.exchange}
            </p>
            
            <div class="quote-card">
              <div class="price-info">
                <div class="current-price">₹{formatPrice(searchAndQuoteData.quote.currentPrice)}</div>
                <div class="change {searchAndQuoteData.quote.change >= 0 ? 'positive' : 'negative'}">
                  {formatPrice(searchAndQuoteData.quote.change)} 
                  ({formatPercent(searchAndQuoteData.quote.changePercent)})
                </div>
              </div>
              <div class="details-grid">
                <div><strong>Previous Close:</strong> ₹{formatPrice(searchAndQuoteData.quote.previousClose)}</div>
                <div><strong>Day High:</strong> ₹{formatPrice(searchAndQuoteData.quote.dayHigh)}</div>
                <div><strong>Day Low:</strong> ₹{formatPrice(searchAndQuoteData.quote.dayLow)}</div>
                <div><strong>Volume:</strong> {formatVolume(searchAndQuoteData.quote.volume)}</div>
                <div><strong>Exchange:</strong> {searchAndQuoteData.quote.exchangeName}</div>
                <div><strong>Source:</strong> {searchAndQuoteData.quote.source}</div>
                <div><strong>Cached:</strong> {searchAndQuoteData.quote.cached ? '✅' : '❌'}</div>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Simple Quote -->
  <section class="api-section">
    <h2>💰 Simple Quote (Recommended)</h2>
    <button on:click={fetchSimpleQuote} disabled={loading[`/simple/${selectedSymbol}`]}>
      {loading[`/simple/${selectedSymbol}`] ? 'Loading...' : `Get Simple Quote for ${selectedSymbol}`}
    </button>
    
    {#if simpleQuote}
      <div class="result-box">
        {#if simpleQuote.error}
          <div class="error">Error: {simpleQuote.error}</div>
          {#if simpleQuote.suggestion}
            <p class="suggestion">💡 {simpleQuote.suggestion}</p>
          {/if}
        {:else}
          <div class="quote-card">
            <h3>{simpleQuote.symbol}</h3>
            <div class="price-info">
              <div class="current-price">₹{formatPrice(simpleQuote.currentPrice)}</div>
              <div class="change {(simpleQuote.currentPrice - simpleQuote.previousClose) >= 0 ? 'positive' : 'negative'}">
                {formatPrice(simpleQuote.currentPrice - simpleQuote.previousClose)} 
                ({formatPercent(((simpleQuote.currentPrice - simpleQuote.previousClose) / simpleQuote.previousClose) * 100)})
              </div>
            </div>
            <div class="details-grid">
              <div><strong>Previous Close:</strong> ₹{formatPrice(simpleQuote.previousClose)}</div>
              <div><strong>Day High:</strong> ₹{formatPrice(simpleQuote.dayHigh)}</div>
              <div><strong>Day Low:</strong> ₹{formatPrice(simpleQuote.dayLow)}</div>
              <div><strong>Volume:</strong> {formatVolume(simpleQuote.volume)}</div>
              <div><strong>Exchange:</strong> {simpleQuote.exchangeName}</div>
              <div><strong>Source:</strong> {simpleQuote.source}</div>
              <div><strong>Cached:</strong> {simpleQuote.cached ? '✅' : '❌'}</div>
              {#if simpleQuote.lastUpdated}
                <div><strong>Last Updated:</strong> {new Date(simpleQuote.lastUpdated).toLocaleString()}</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Enhanced Quote -->
  <section class="api-section">
    <h2>📈 Enhanced Quote</h2>
    <button on:click={fetchEnhancedQuote} disabled={loading[`/stock/${selectedSymbol}/quote`]}>
      {loading[`/stock/${selectedSymbol}/quote`] ? 'Loading...' : `Get Enhanced Quote for ${selectedSymbol}`}
    </button>
    
    {#if enhancedQuote}
      <div class="result-box">
        {#if enhancedQuote.error}
          <div class="error">Error: {enhancedQuote.error}</div>
          {#if enhancedQuote.suggestion}
            <p class="suggestion">💡 {enhancedQuote.suggestion}</p>
          {/if}
        {:else}
          <div class="quote-card">
            <h3>{enhancedQuote.symbol}</h3>
            <div class="price-info">
              <div class="current-price">₹{formatPrice(enhancedQuote.currentPrice)}</div>
              <div class="change {enhancedQuote.change >= 0 ? 'positive' : 'negative'}">
                {formatPrice(enhancedQuote.change)} ({formatPercent(enhancedQuote.changePercent)})
              </div>
            </div>
            <div class="details-grid">
              <div><strong>Previous Close:</strong> ₹{formatPrice(enhancedQuote.previousClose)}</div>
              <div><strong>Currency:</strong> {enhancedQuote.currency}</div>
              <div><strong>Market State:</strong> {enhancedQuote.marketState || 'N/A'}</div>
              <div><strong>Source:</strong> {enhancedQuote.source}</div>
              <div><strong>Cached:</strong> {enhancedQuote.cached ? '✅' : '❌'}</div>
              {#if enhancedQuote.lastUpdated}
                <div><strong>Last Updated:</strong> {new Date(enhancedQuote.lastUpdated).toLocaleString()}</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Test Endpoint -->
  <section class="api-section">
    <h2>🧪 Test Multiple Methods</h2>
    <button on:click={fetchTestData} disabled={loading[`/test/${testSymbol}`]}>
      {loading[`/test/${testSymbol}`] ? 'Loading...' : `Test Methods for ${testSymbol}`}
    </button>
    
    {#if testData}
      <div class="result-box">
        {#each Object.entries(testData) as [method, result]}
          <div class="test-result">
            <h4>{method.toUpperCase()} Method</h4>
            <div class="status {result.status}">Status: {result.status}</div>
            {#if result.status === 'success' && result.data}
              <pre>{JSON.stringify(result.data, null, 2)}</pre>
            {:else if result.error}
              <div class="error">Error: {result.error}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Stock Details -->
  <section class="api-section">
    <h2>📊 Comprehensive Stock Details</h2>
    <button on:click={fetchStockDetails} disabled={loading[`/stock/${selectedSymbol}/details`]}>
      {loading[`/stock/${selectedSymbol}/details`] ? 'Loading...' : `Get Details for ${selectedSymbol}`}
    </button>
    
    {#if stockDetails}
      <div class="result-box">
        {#if stockDetails.error}
          <div class="error">Error: {stockDetails.error}</div>
        {:else}
          <div class="details-card">
            <h3>{stockDetails.symbol}</h3>
            <div class="details-grid">
              <div><strong>Current Price:</strong> ₹{formatPrice(stockDetails.currentPrice)}</div>
              <div><strong>Market Cap:</strong> {formatMarketCap(stockDetails.marketCap)}</div>
              <div><strong>52W High:</strong> ₹{formatPrice(stockDetails.fiftyTwoWeekHigh)}</div>
              <div><strong>52W Low:</strong> ₹{formatPrice(stockDetails.fiftyTwoWeekLow)}</div>
              <div><strong>P/E Ratio:</strong> {formatPrice(stockDetails.peRatio)}</div>
              <div><strong>EPS:</strong> {formatPrice(stockDetails.eps)}</div>
              <div><strong>Beta:</strong> {formatPrice(stockDetails.beta)}</div>
              <div><strong>Dividend Yield:</strong> {formatPercent(stockDetails.dividendYield * 100)}</div>
              <div><strong>Change:</strong> 
                <span class="change {stockDetails.change >= 0 ? 'positive' : 'negative'}">
                  {formatPrice(stockDetails.change)} ({formatPercent(stockDetails.changePercent)})
                </span>
              </div>
              <div><strong>Cached:</strong> {stockDetails.cached ? '✅' : '❌'}</div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Historical Data -->
  <section class="api-section">
    <h2>📅 Historical Data</h2>
    <div class="button-group">
      <button on:click={() => fetchHistoricalData('1d')} disabled={loading[`/stock/${selectedSymbol}/1d`]}>
        1 Day
      </button>
      <button on:click={() => fetchHistoricalData('5d')} disabled={loading[`/stock/${selectedSymbol}/5d`]}>
        5 Days
      </button>
      <button on:click={() => fetchHistoricalData('1mo')} disabled={loading[`/stock/${selectedSymbol}/1mo`]}>
        1 Month
      </button>
      <button on:click={() => fetchHistoricalData('3mo')} disabled={loading[`/stock/${selectedSymbol}/3mo`]}>
        3 Months
      </button>
      <button on:click={() => fetchHistoricalData('1y')} disabled={loading[`/stock/${selectedSymbol}/1y`]}>
        1 Year
      </button>
    </div>
    
    {#each Object.entries(historicalData) as [period, data]}
      <div class="result-box">
        <h4>{period.toUpperCase()} Data for {data.symbol}</h4>
        <p><strong>Period:</strong> {data.period} | <strong>Interval:</strong> {data.interval} | <strong>Cached:</strong> {data.cached ? '✅' : '❌'}</p>
        
        {#if data.fiftyTwoWeekHigh}
          <p><strong>52W High:</strong> ₹{formatPrice(data.fiftyTwoWeekHigh)} | <strong>52W Low:</strong> ₹{formatPrice(data.fiftyTwoWeekLow)}</p>
        {/if}
        
        {#if data.data && data.data.length > 0}
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>{data.interval === '1m' || data.interval === '5m' ? 'Time' : 'Date'}</th>
                  <th>Open</th>
                  <th>High</th>
                  <th>Low</th>
                  <th>Close</th>
                  <th>Volume</th>
                </tr>
              </thead>
              <tbody>
                {#each data.data.slice(-10) as row}
                  <tr>
                    <td>{row.time ? new Date(row.time).toLocaleString() : row.date}</td>
                    <td>₹{formatPrice(row.open)}</td>
                    <td>₹{formatPrice(row.high)}</td>
                    <td>₹{formatPrice(row.low)}</td>
                    <td>₹{formatPrice(row.close)}</td>
                    <td>{formatVolume(row.volume)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
            <p><small>Showing last 10 entries of {data.data.length} total</small></p>
          </div>
        {/if}
      </div>
    {/each}
  </section>

  <!-- Compare Stocks -->
  <section class="api-section">
    <h2>⚖️ Compare Stocks</h2>
    <div class="input-group">
      <label>
        Symbols (comma-separated):
        <input bind:value={compareSymbols} placeholder="RELIANCE,TCS,INFY" />
      </label>
    </div>
    <button on:click={fetchCompareStocks} disabled={loading['/stocks/compare']}>
      {loading['/stocks/compare'] ? 'Loading...' : 'Compare Stocks'}
    </button>
    
    {#if compareData}
      <div class="result-box">
        {#if compareData.stocks}
          <div class="comparison-grid">
            {#each compareData.stocks as stock}
              <div class="comparison-card">
                {#if stock.error}
                  <h4>{stock.symbol}</h4>
                  <div class="error">{stock.error}</div>
                {:else}
                  <h4>{stock.symbol}</h4>
                  <div class="price">₹{formatPrice(stock.currentPrice)}</div>
                  <div class="change {stock.change >= 0 ? 'positive' : 'negative'}">
                    {formatPrice(stock.change)} ({formatPercent(stock.changePercent)})
                  </div>
                  <div class="volume">Volume: {formatVolume(stock.volume)}</div>
                  <div class="cached">Cached: {stock.cached ? '✅' : '❌'}</div>
                {/if}
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Enhanced Search Stocks -->
  <section class="api-section">
    <h2>🔍 Enhanced Search Stocks</h2>
    <p class="feature-description">Search includes both local database and online sources</p>
    <div class="input-group">
      <label>
        Search Query:
        <input bind:value={searchQuery} placeholder="e.g., tesla, apple, reliance, airtel" />
      </label>
    </div>
    <button on:click={fetchSearchResults} disabled={loading[`/search/${searchQuery}`]}>
      {loading[`/search/${searchQuery}`] ? 'Loading...' : 'Search Stocks (Online + Local)'}
    </button>
    
    {#if searchResults}
      <div class="result-box">
        <div class="search-header">
          <h4>Search Results for "{searchResults.query}"</h4>
          <div class="search-meta">
            <span class="count">Found {searchResults.resultsCount} results</span>
            <span class="source">Source: {searchResults.source}</span>
          </div>
        </div>
        
        {#if searchResults.results && searchResults.results.length > 0}
          <div class="search-results-grid">
            {#each searchResults.results as result}
              <div class="search-result-card">
                <div class="symbol">{result.symbol}</div>
                <div class="name">{result.name || result.long_name || 'N/A'}</div>
                {#if result.exchange}
                  <div class="exchange">Exchange: {result.exchange}</div>
                {/if}
                {#if result.type}
                  <div class="type">Type: {result.type}</div>
                {/if}
                {#if result.sector}
                  <div class="sector">Sector: {result.sector}</div>
                {/if}
                <button 
                  class="quick-quote-btn" 
                  on:click={() => {
                    selectedSymbol = result.symbol.replace('.NS', '');
                    fetchSimpleQuote();
                  }}
                >
                  Get Quote
                </button>
              </div>
            {/each}
          </div>
        {:else}
          <p>No results found</p>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Popular Stocks -->
  <section class="api-section">
    <h2>🌟 Popular Stocks</h2>
    <button on:click={fetchPopularStocks} disabled={loading['/popular']}>
      {loading['/popular'] ? 'Loading...' : 'Get Popular Stocks'}
    </button>
    
    {#if popularStocks}
      <div class="result-box">
        <h4>Popular Stocks ({popularStocks.category})</h4>
        {#if popularStocks.results && popularStocks.results.length > 0}
          <ul class="popular-list">
            {#each popularStocks.results as stock}
              <li>
                <strong>{stock.symbol}</strong> - {stock.name || 'N/A'}
                {#if stock.sector}<span class="sector">({stock.sector})</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Popular by Category -->
  <section class="api-section">
    <h2>📂 Popular by Category</h2>
    <div class="input-group">
      <label>
        Category:
        <select bind:value={popularCategory}>
          <option value="nifty50">Nifty 50</option>
          <option value="nifty100">Nifty 100</option>
          <option value="banking">Banking</option>
          <option value="it">IT</option>
          <option value="pharma">Pharma</option>
        </select>
      </label>
    </div>
    <button on:click={fetchPopularByCategory} disabled={loading[`/popular/${popularCategory}`]}>
      {loading[`/popular/${popularCategory}`] ? 'Loading...' : `Get ${popularCategory} Stocks`}
    </button>
    
    {#if popularByCategory}
      <div class="result-box">
        <h4>{popularByCategory.category} Stocks</h4>
        {#if popularByCategory.results && popularByCategory.results.length > 0}
          <ul class="popular-list">
            {#each popularByCategory.results as stock}
              <li>
                <strong>{stock.symbol}</strong> - {stock.name || 'N/A'}
                {#if stock.sector}<span class="sector">({stock.sector})</span>{/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </section>

  <!-- Enhanced Cache Management -->
  <section class="api-section">
    <h2>🧹 Cache Management</h2>
    <button on:click={cleanCache} disabled={loading['/cache/clean']}>
      {loading['/cache/clean'] ? 'Cleaning...' : 'Clean Expired Cache'}
    </button>
    
    {#if cacheCleanResult}
      <div class="result-box">
        <h4>Cache Cleanup Results</h4>
        <p>{cacheCleanResult.message}</p>
        <div class="cache-stats">
          {#if cacheCleanResult.quoteCacheEntriesRemoved !== undefined}
            <div><strong>Quote Cache Entries Removed:</strong> {cacheCleanResult.quoteCacheEntriesRemoved}</div>
          {/if}
          {#if cacheCleanResult.searchCacheEntriesRemoved !== undefined}
            <div><strong>Search Cache Entries Removed:</strong> {cacheCleanResult.searchCacheEntriesRemoved}</div>
          {/if}
          {#if cacheCleanResult.totalEntriesRemoved !== undefined}
            <div><strong>Total Entries Removed:</strong> {cacheCleanResult.totalEntriesRemoved}</div>
          {/if}
          {#if cacheCleanResult.entriesRemoved !== undefined}
            <div><strong>Entries Removed:</strong> {cacheCleanResult.entriesRemoved}</div>
          {/if}
        </div>
      </div>
    {/if}
  </section>
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
  
  header {
    text-align: center;
    margin-bottom: 40px;
  }
  
  h1 {
    color: #2563eb;
    margin-bottom: 10px;
  }
  
  .api-section {
    margin-bottom: 40px;
    padding: 20px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
  }
  
  .api-section.featured {
    border: 2px solid #10b981;
    background: linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%);
  }
  
  .api-section.settings-section {
    background: linear-gradient(135deg, #fef3c7 0%, #fef7cd 100%);
    border: 1px solid #f59e0b;
  }
  
  .api-section h2 {
    margin-top: 0;
    color: #374151;
  }
  
  .feature-description {
    color: #6b7280;
    font-style: italic;
    margin-bottom: 15px;
  }
  
  .input-group {
    display: flex;
    gap: 20px;
    margin-bottom: 15px;
    flex-wrap: wrap;
  }
  
  .input-group label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 200px;
  }
  
  .checkbox-label {
    flex-direction: row !important;
    align-items: center;
    gap: 10px !important;
    min-width: auto !important;
  }
  
  .note {
    color: #6b7280;
    font-size: 0.9em;
    margin-top: 10px;
  }
  
  .suggestion {
    color: #059669;
    background: #ecfdf5;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid #10b981;
    margin-top: 10px;
  }
  
  input, select {
    padding: 8px 12px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 14px;
  }
  
  button {
    background: #2563eb;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin: 5px;
  }
  
  button:hover:not(:disabled) {
    background: #1d4ed8;
  }
  
  button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }
  
  .quick-quote-btn {
    background: #059669;
    font-size: 12px;
    padding: 6px 12px;
    margin: 5px 0 0 0;
  }
  
  .quick-quote-btn:hover:not(:disabled) {
    background: #047857;
  }
  
  .button-group {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  
  .result-box {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    padding: 15px;
    margin-top: 15px;
  }
  
  .quote-card {
    text-align: center;
  }
  
  .quote-card h3 {
    margin: 0 0 15px 0;
    color: #374151;
  }
  
  .price-info {
    margin-bottom: 20px;
  }
  
  .current-price {
    font-size: 2em;
    font-weight: bold;
    color: #111827;
  }
  
  .change {
    font-size: 1.2em;
    font-weight: 600;
    margin-top: 5px;
  }
  
  .change.positive {
    color: #059669;
  }
  
  .change.negative {
    color: #dc2626;
  }
  
  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    text-align: left;
  }
  
  .details-card .details-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }
  
  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 15px;
  }
  
  .feature-item {
    background: white;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
  }
  
  .endpoints-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 15px;
  }
  
  .endpoint {
    background: #f3f4f6;
    padding: 5px 8px;
    border-radius: 3px;
    font-size: 12px;
    display: inline-block;
  }
  
  .notes-list {
    margin: 0;
    padding-left: 20px;
  }
  
  .search-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    flex-wrap: wrap;
    gap: 10px;
  }
  
  .search-meta {
    display: flex;
    gap: 15px;
    font-size: 0.9em;
    color: #6b7280;
  }
  
  .count {
    font-weight: 600;
  }
  
  .source {
    background: #dbeafe;
    padding: 2px 8px;
    border-radius: 12px;
    color: #1d4ed8;
  }
  
  .search-results-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 15px;
  }
  
  .search-result-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 15px;
  }
  
  .search-result-card .symbol {
    font-weight: bold;
    font-size: 1.1em;
    color: #1d4ed8;
    margin-bottom: 5px;
  }
  
  .search-result-card .name {
    color: #374151;
    margin-bottom: 8px;
    font-size: 0.95em;
  }
  
  .search-result-card .exchange,
  .search-result-card .type,
  .search-result-card .sector {
    font-size: 0.85em;
    color: #6b7280;
    margin-bottom: 3px;
  }
  
  .search-quote-result {
    text-align: center;
  }
  
  .stock-info {
    color: #6b7280;
    margin-bottom: 20px;
  }
  
  .cache-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 10px;
    margin-top: 15px;
  }
  
  .cache-stats > div {
    background: #f3f4f6;
    padding: 10px;
    border-radius: 4px;
  }
  
  .error {
    color: #dc2626;
    background: #fee2e2;
    padding: 10px;
    border-radius: 4px;
    border: 1px solid #fecaca;
  }
  
  .test-result {
    margin-bottom: 20px;
    padding: 15px;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
  }
  
  .status {
    font-weight: bold;
    margin-bottom: 10px;
  }
  
  .status.success {
    color: #059669;
  }
  
  .status.failed {
    color: #dc2626;
  }
  
  .table-container {
    overflow-x: auto;
  }
  
  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
  }
  
  th, td {
    border: 1px solid #e5e7eb;
    padding: 8px 12px;
    text-align: left;
  }
  
  th {
    background: #f3f4f6;
    font-weight: 600;
  }
  
  .comparison-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 15px;
  }
  
  .comparison-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    padding: 15px;
    text-align: center;
  }
  
  .comparison-card h4 {
    margin: 0 0 10px 0;
  }
  
  .comparison-card .price {
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 5px;
  }
  
  .comparison-card .volume, .comparison-card .cached {
    font-size: 0.9em;
    color: #6b7280;
    margin-top: 5px;
  }
  
  .search-results, .popular-list {
    list-style: none;
    padding: 0;
  }
  
  .search-results li, .popular-list li {
    padding: 10px;
    border-bottom: 1px solid #e5e7eb;
  }
  
  .search-results li:last-child, .popular-list li:last-child {
    border-bottom: none;
  }
  
  .sector {
    color: #6b7280;
    font-size: 0.9em;
  }
  
  pre {
    background: #f3f4f6;
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    font-size: 12px;
  }
  
  @media (max-width: 768px) {
    .input-group {
      flex-direction: column;
    }
    
    .input-group label {
      min-width: auto;
    }
    
    .comparison-grid, .search-results-grid {
      grid-template-columns: 1fr;
    }
    
    .details-grid {
      grid-template-columns: 1fr;
    }
    
    .search-header {
      flex-direction: column;
      align-items: flex-start;
    }
    
    .search-meta {
      flex-direction: column;
      gap: 5px;
    }
  }
</style>