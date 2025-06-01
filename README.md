# M-Pesa Integration API

A complete M-Pesa Daraja API integration built with NestJS, Prisma, and PostgreSQL. This system handles STK Push payments with real-time callback processing and transaction management.

## Features

- **STK Push Payments** - Initiate mobile payments directly to customer phones
- **Real-time Callbacks** - Process M-Pesa payment notifications automatically
- **Transaction Management** - Complete transaction lifecycle tracking
- **Database Integration** - PostgreSQL with Prisma ORM
- **Rate Limiting** - Built-in throttling for API protection
- **Circuit Breaker** - Fault tolerance for M-Pesa API calls
- **Comprehensive Logging** - Detailed request/response logging
- **API Documentation** - Auto-generated Swagger docs

## Prerequisites

- Node.js (v16 or higher)
- PostgreSQL database
- M-Pesa Daraja API credentials (sandbox or production)
- ngrok (for callback URL in development)

## 🛠 Installation

### 1. Clone and Install Dependencies

```bash
git clone <your-repo>
cd mpesa-integration
npm install
```

### 2. Environment Setup

Create `.env` file:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/mpesa_db"

# M-Pesa Credentials (Sandbox)
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_BUSINESS_SHORT_CODE=#
MPESA_PASSKEY=your_passkey
MPESA_ENVIRONMENT=sandbox
MPESA_CALLBACK_URL=https://your-ngrok-url.ngrok-free.app/api/mpesa/callback

# Server
PORT=3000
NODE_ENV=development
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate dev


### 4. Start Development Server

```bash
# Terminal 1: Start the API
npm run start:dev

# Terminal 2: Start ngrok for callbacks
ngrok http 3000
```

## 📊 Database Schema

The system uses a prisma ORM + postgresql

## 🔌 API Endpoints

### Base URL: `http://{url}/api`

### 1. Health Check
```http
GET /mpesa/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-06-01T12:00:00.000Z",
  "service": "M-Pesa Integration",
  "circuitBreaker": {
    "state": "CLOSED",
    "failures": 0
  }
}
```

### 2. Initiate STK Push
```http
POST /mpesa/stk-push
Content-Type: application/json
```

**Request Body:**
```json
{
  "amount": 1,
  "phoneNumber": "254708374149",
  "accountReference": "ORDER001",
  "transactionDesc": "Payment for services"
}
```

**Response:**
```json
{
  "MerchantRequestID": "29115-34620561-1",
  "CheckoutRequestID": "ws_CO_DMZ_123456789_01062025120000",
  "ResponseCode": "0",
  "ResponseDescription": "Success. Request accepted for processing",
  "CustomerMessage": "Success. Request accepted for processing"
}
```

### 3. M-Pesa Callback (Webhook)
```http
POST /mpesa/callback
Content-Type: application/json
```

**M-Pesa sends this automatically:**
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29115-34620561-1",
      "CheckoutRequestID": "ws_CO_DMZ_123456789_01062025120000",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {"Name": "Amount", "Value": 1},
          {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
          {"Name": "TransactionDate", "Value": "20250601120000"},
          {"Name": "PhoneNumber", "Value": "254708374149"}
        ]
      }
    }
  }
}
```

### 4. Get Transaction Status
```http
GET /mpesa/transaction/{checkoutRequestId}
```

**Response:**
```json
{
  "id": "clq1234567890",
  "checkoutRequestID": "ws_CO_DMZ_123456789_01062025120000",
  "merchantRequestID": "29115-34620561-1",
  "amount": 1,
  "phoneNumber": "254708374149",
  "status": "SUCCESS",
  "mpesaReceiptNumber": "NLJ7RT61SV",
  "transactionDate": "2025-06-01T12:00:00.000Z",
  "createdAt": "2025-06-01T12:00:00.000Z",
  "updatedAt": "2025-06-01T12:00:05.000Z"
}
```

### Manual Callback

Use this payload to test callbacks (replace with actual IDs):

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "YOUR_ACTUAL_MERCHANT_REQUEST_ID",
      "CheckoutRequestID": "YOUR_ACTUAL_CHECKOUT_REQUEST_ID",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {"Name": "Amount", "Value": 1},
          {"Name": "MpesaReceiptNumber", "Value": "NLJ7RT61SV"},
          {"Name": "TransactionDate", "Value": "20250601120000"},
          {"Name": "PhoneNumber", "Value": "254708374149"}
        ]
      }
    }
  }
}
```


## 🔍 Monitoring & Logging

### View Logs
```bash
# All logs in development
npm run start:dev

### Key Log Events
- STK Push initiation
- M-Pesa API responses
- Callback processing
- Database updates
- Circuit breaker state changes

### Database Monitoring
```bash
# Open Prisma Studio
npx prisma studio

# Direct database access
psql postgresql://postgres:password@localhost:5432/mpesa_db
```

## 📄 API Documentation

Access interactive Swagger documentation:
- Development: `http://{url}/api-docs`


### Debug Mode

Enable detailed logging:
```typescript
// In main.ts
app.useLogger(['log', 'error', 'warn', 'debug', 'verbose']);
```


## 📄 License

This project is licensed under the MIT License.


**Built with ❤️ using NestJS, Prisma, and M-Pesa Daraja API**
feat(mpesa): Implement M-Pesa integration with STK Push, Callback handling, and Transaction management

- Added DTOs for M-Pesa callback, response, and STK Push requests.
- Created MpesaController with endpoints for health check, STK Push initiation, callback handling, and transaction status retrieval.
- Developed MpesaService to manage M-Pesa API interactions, including circuit breaker logic for error handling.
- Introduced PrismaService for database interactions and transaction logging.
- Enhanced utility functions for phone number formatting and callback metadata parsing.
- Implemented IP whitelisting for callback endpoint security.
- Added TypeScript configuration for improved build process.