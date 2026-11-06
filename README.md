# INFINIX Backend Server

High-performance Node.js Fastify backend engine connected to MongoDB Atlas for the **INFINIX Private Wealth & Contractual Yield Desk**.

This single unified server powers:
1. **The Client Mobile Application** (`investment-portfolio-dashboard` - Expo / React Native)
2. **The Institutional Admin Web Interface** (`infinix-web-interface` - Next.js / TailwindCSS)

---

## 🛠 Tech Stack

- **Runtime**: Node.js (v20+ / v24)
- **Framework**: Fastify 5
- **Language**: TypeScript (NodeNext)
- **Database**: MongoDB Atlas via Mongoose 9
- **Authentication**: JWT (`@fastify/jwt`) & bcryptjs
- **CORS**: `@fastify/cors` (allows both mobile app and web frontend)

---

## ⚙️ Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
HOST=0.0.0.0
NODE_ENV=development
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.oimwjjg.mongodb.net/infinix?retryWrites=true&w=majority
JWT_SECRET=your_jwt_secret_here
CORS_ORIGIN=*
```

> **Important**: In MongoDB Atlas, go to **Network Access** → **Add IP Address** → **Allow Access from Anywhere (0.0.0.0/0)** so both local dev machines and deployed cloud environments can connect.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode with hot reload
npm run dev

# 3. Seed database manually (optional, auto-seeds on first launch)
npm run seed

# 4. Build for production
npm run build

# 5. Start production server
npm start
```

---

## 📡 API Endpoints

### 🔐 Authentication (`/api/auth`)
- `POST /api/auth/login` - Authenticate client or admin
- `POST /api/auth/register` - Register new investor
- `POST /api/auth/verify-phone` - Complete investor phone verification

### 👥 Client Management (`/api/clients`)
- `GET /api/clients` - List all clients (filters: `search`, `kycStatus`)
- `GET /api/clients/:id` - Get client profile by ID
- `POST /api/clients` - Admin create client profile
- `PATCH /api/clients/:id` - Update client information
- `POST /api/clients/:id/assign-plan` - Assign 14-Month 15% plan to client

### 📋 Plans (`/api/plans`)
- `GET /api/plans` - List investment plans (14-Month 15% Accelerator)
- `POST /api/plans` - Create custom investment plan
- `PATCH /api/plans/:id` - Update plan terms

### 💼 Investments (`/api/investments`)
- `GET /api/investments` - List investments (filter by `clientId`)
- `POST /api/investments` - Record new investment holding
- `PATCH /api/investments/:id` - Update valuation or notes
- `DELETE /api/investments/:id` - Remove investment

### 💸 Withdrawals & Payouts (`/api/withdrawals`)
- `GET /api/withdrawals` - List withdrawals (filter by `clientId`, `status`)
- `POST /api/withdrawals/request` - Client submits monthly 15% payout request
- `PATCH /api/withdrawals/:id/status` - Admin approve, disburse (with UTR), or reject

### ⇄ Transactions Ledger (`/api/transactions`)
- `GET /api/transactions` - Filtered ledger transactions
- `POST /api/transactions` - Record manual distribution or deposit

### 🎁 Referrals & Multi-Tier Syndicate (`/api/referrals`)
- `GET /api/referrals` - List referrals (filter by `referrerId`)
- `GET /api/referrals/tiers` - Get Level 1, Level 2, Level 3 tiers
- `POST /api/referrals` - Register referral relationship

### 🛡️ Audit Logs (`/api/audit-logs`)
- `GET /api/audit-logs` - Query compliance and administrative audit trail
- `POST /api/audit-logs` - Record administrative action

