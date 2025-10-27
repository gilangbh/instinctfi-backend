# Market API Endpoints

This document describes the new market data endpoints added to the Instinct.fi API.

## Base URL
`/api/v1/market`

## Endpoints

### 1. Get Current Price
**GET** `/market/price/:symbol`

Get the current price data for a specific symbol.

**Parameters:**
- `symbol` (path) - Trading symbol (e.g., SOL, BTC, ETH)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "SOL_1234567890",
    "symbol": "SOL",
    "price": 150.50,
    "high": 152.00,
    "low": 148.00,
    "volume": 1250000,
    "timestamp": "2025-10-23T12:00:00.000Z"
  }
}
```

### 2. Get Price History
**GET** `/market/price-history/:symbol`

Get historical price data for a specific symbol.

**Parameters:**
- `symbol` (path) - Trading symbol (e.g., SOL, BTC, ETH)
- `timeframe` (query, optional) - Time period for history (default: "1h")
  - Examples: "1h", "24h", "7d", "30d"

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "SOL_1234567890",
      "symbol": "SOL",
      "price": 150.50,
      "high": 152.00,
      "low": 148.00,
      "volume": 1250000,
      "timestamp": "2025-10-23T12:00:00.000Z"
    },
    // ... more price data points
  ],
  "metadata": {
    "symbol": "SOL",
    "timeframe": "1h",
    "hours": 1,
    "count": 60
  }
}
```

### 3. Get Price Change
**GET** `/market/price-change/:symbol`

Get the price change percentage for a specific symbol over a time period.

**Parameters:**
- `symbol` (path) - Trading symbol (e.g., SOL, BTC, ETH)
- `hours` (query, optional) - Number of hours to calculate change (default: 24)

**Response:**
```json
{
  "success": true,
  "data": {
    "symbol": "SOL",
    "hours": 24,
    "changePercent": 2.5
  }
}
```

### 4. Get All Current Prices
**GET** `/market/prices`

Get current prices for all tracked symbols.

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "SOL_1234567890",
      "symbol": "SOL",
      "price": 150.50,
      "high": 152.00,
      "low": 148.00,
      "volume": 1250000,
      "timestamp": "2025-10-23T12:00:00.000Z"
    },
    // ... more symbols
  ],
  "metadata": {
    "count": 10
  }
}
```

### 5. Get Price Service Stats
**GET** `/market/stats`

Get statistics about the price monitoring service.

**Response:**
```json
{
  "success": true,
  "data": {
    "trackedSymbols": 10,
    "lastUpdate": "2025-10-23T12:00:00.000Z",
    "isRunning": true
  }
}
```

## Tracked Symbols

The API currently tracks the following symbols:
- SOL (Solana)
- BTC (Bitcoin)
- ETH (Ethereum)
- RAY (Raydium)
- SRM (Serum)
- ORCA (Orca)
- MNGO (Mango)
- COPE (Cope)
- STEP (Step)
- MEDIA (Media)

## Price Updates

- Prices are updated every **5 seconds** via the price monitoring service
- Historical price data is stored in the database every **1 minute**
- Price updates are also broadcast via WebSocket to connected clients

## WebSocket Updates

Subscribe to real-time price updates via WebSocket:

```javascript
ws.send(JSON.stringify({
  type: 'PRICE_UPDATE',
  data: {
    symbol: 'SOL',
    price: 150.50,
    change24h: 2.5
  }
}));
```

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common status codes:
- `404` - Symbol not found
- `500` - Server error





