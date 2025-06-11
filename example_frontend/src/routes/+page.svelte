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
  
  // Input values
  let selectedSymbol = 'RELIANCE';
  let testSymbol = 'TCS';
  let compareSymbols = 'RELIANCE,TCS,INFY';
  let searchQuery = 'reliance';
  let popularCategory = 'nifty50';
  
  // Loading states
  let loading = {};
  
  // Utility function to handle API calls
  async function apiCall(endpoint, options = {}) {
    const loadingKey = endpoint;
    loading[loadingKey] = true;
    loading = { ...loading };
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
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
    searchResults = await apiCall(`/search/${searchQuery}`);
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
    <p>Comprehensive demonstration of all available endpoints</p>
  </header>

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
          <ul>
            {#each Object.entries(healthData.features) as [key, value]}
              <li><strong>{key}:</strong> {value}</li>
            {/each}
          </ul>
        {/if}
        {#if healthData.endpoints}
          <h4>Available Endpoints:</h4>
          <ul>
            {#each healthData.endpoints as endpoint}
              <li><code>{endpoint}</code></li>
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
              <div><strong>Market State:</strong> {enhancedQuote.marketState}</div>
              <div><strong>Source:</strong> {enhancedQuote.source}</div>
              <div><strong>Cached:</strong> {enhancedQuote.cached ? '✅' : '❌'}</div>
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
              <div><strong>Market Cap:</strong> ₹{formatVolume(stockDetails.marketCap)}</div>
              <div><strong>52W High:</strong> ₹{formatPrice(stockDetails.fiftyTwoWeekHigh)}</div>
              <div><strong>52W Low:</strong> ₹{formatPrice(stockDetails.fiftyTwoWeekLow)}</div>
              <div><strong>P/E Ratio:</strong> {formatPrice(stockDetails.peRatio)}</div>
              <div><strong>EPS:</strong> {formatPrice(stockDetails.eps)}</div>
              <div><strong>Beta:</strong> {formatPrice(stockDetails.beta)}</div>
              <div><strong>Dividend Yield:</strong> {formatPercent(stockDetails.dividendYield * 100)}</div>
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

  <!-- Search Stocks -->
  <section class="api-section">
    <h2>🔍 Search Stocks</h2>
    <div class="input-group">
      <label>
        Search Query:
        <input bind:value={searchQuery} placeholder="reliance" />
      </label>
    </div>
    <button on:click={fetchSearchResults} disabled={loading[`/search/${searchQuery}`]}>
      {loading[`/search/${searchQuery}`] ? 'Loading...' : 'Search Stocks'}
    </button>
    
    {#if searchResults}
      <div class="result-box">
        <h4>Search Results for "{searchResults.query}"</h4>
        {#if searchResults.results && searchResults.results.length > 0}
          <ul class="search-results">
            {#each searchResults.results as result}
              <li>
                <strong>{result.symbol}</strong> - {result.name || 'N/A'}
                {#if result.sector}<span class="sector">({result.sector})</span>{/if}
              </li>
            {/each}
          </ul>
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

  <!-- Cache Management -->
  <section class="api-section">
    <h2>🧹 Cache Management</h2>
    <button on:click={cleanCache} disabled={loading['/cache/clean']}>
      {loading['/cache/clean'] ? 'Cleaning...' : 'Clean Expired Cache'}
    </button>
    
    {#if cacheCleanResult}
      <div class="result-box">
        <p>{cacheCleanResult.message}</p>
        {#if cacheCleanResult.entriesRemoved !== undefined}
          <p><strong>Entries Removed:</strong> {cacheCleanResult.entriesRemoved}</p>
        {/if}
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
  
  .api-section h2 {
    margin-top: 0;
    color: #374151;
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
    
    .comparison-grid {
      grid-template-columns: 1fr;
    }
    
    .details-grid {
      grid-template-columns: 1fr;
    }
  }
</style>