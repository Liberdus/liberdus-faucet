# Liberdus Faucet API

A NestJS-based faucet API server that receives faucet requests from the front-end, validates them, and injects transfer transactions to user accounts on the Liberdus blockchain.

## Features

- 🚰 **Faucet Module**: Handles API requests and validation
- ⛓️ **Blockchain Module**: Manages transaction injection and signing
- 📊 **Stats Module**: Tracks faucet requests and transaction hashes
- 🔒 **Validation**: Request validation and signature verification
- 🌐 **CORS Support**: Ready for frontend integration

## Architecture

The application consists of three main modules:

1. **Faucet Module** - Handles HTTP endpoints and request processing
2. **Blockchain Module** - Manages blockchain interactions and transaction signing
3. **Stats Module** - Stores and retrieves faucet request statistics

## API Endpoints

### POST /faucet
Submit a faucet request.

**Request Body:**
```json
{
  "nodeAddress": "string",
  "username": "string", 
  "userAddress": "string",
  "sign": {
    "owner": "string",
    "sig": "string"
  }
}
```

**Response:**
```json
{
  "success": boolean,
  "requestId": "string",
  "txHash": "string",
  "message": "string"
}
```

### GET /faucet/health
Health check endpoint.

### GET /faucet/stats
Get faucet statistics.

### GET /faucet/request/:id
Get specific faucet request details.

## Setup

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. **Start the server:**
```bash
npm run start:dev
```

## Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Blockchain Configuration
BLOCKCHAIN_PROTOCOL=http
BLOCKCHAIN_HOST=localhost:9001
NETWORK_ID=1

# Faucet Configuration  
FAUCET_AMOUNT=10
FAUCET_ADDRESS=your_faucet_address
FAUCET_PRIVATE_KEY=your_private_key

# Crypto Configuration
CRYPTO_KEY=69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc

# Server Configuration
PORT=3000
```

## Testing

Test the API manually:
```bash
node test-api.js
```

Or use curl:
```bash
# Health check
curl http://localhost:3000/faucet/health

# Stats
curl http://localhost:3000/faucet/stats

# Faucet request
curl -X POST http://localhost:3000/faucet \
  -H "Content-Type: application/json" \
  -d '{
    "nodeAddress": "node123",
    "username": "testuser", 
    "userAddress": "0x742d35Cc6635C0532925a3b8D4C01c3444fb6C1f",
    "sign": {
      "owner": "742d35cc6635c0532925a3b8d4c01c3444fb6c1f",
      "sig": "0x1234...abcdef"
    }
  }'
```

## Development

```bash
# Development mode with hot reload
npm run start:dev

# Production build
npm run build

# Production mode
npm run start:prod
```

## Security Notes

- The current implementation includes mock crypto utilities
- Replace with actual `@shardus/crypto-utils` when available
- Implement proper signature verification
- Use secure key management for production
- Consider rate limiting for production deployments

## Dependencies

- **NestJS**: Web framework
- **ethers**: Ethereum utilities for signing
- **axios**: HTTP client for blockchain communication
- **class-validator**: Request validation
- **dotenv**: Environment variable management
