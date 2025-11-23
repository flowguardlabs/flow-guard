# FlowGuard 🛡️

<p align="center">
  <strong>Safe, automated, on-chain treasury management for Bitcoin Cash</strong>
</p>

<p align="center">
  FlowGuard enables recurring budget releases, role-based approval, and spending guardrails — all enforced on-chain — without making teams surrender custody of their funds.
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#deployment">Deployment</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## 🎯 Mission

We're building a treasury management system for Bitcoin Cash teams that actually makes sense. No custodial risk, no manual spreadsheets, no trust required. Just on-chain rules that execute automatically.

Think of it like a smart multisig wallet that can handle recurring payments, spending limits, and multi-party approvals - all enforced by Bitcoin Cash covenants.

## ✨ Features

### 🔄 Recurring Unlock Schedules
Automated periodic fund releases using Loop covenants. Set up monthly, weekly, or custom unlock cycles that execute automatically on-chain.

### 👥 Multi-Signature Approval
Configurable M-of-N signer thresholds (2-of-3, 3-of-5, etc.) ensure no single party can unilaterally drain the treasury. All proposals require approval from multiple authorized signers.

### 🔒 Spending Guardrails
On-chain rules prevent treasury misuse. Set spending caps per proposal, per period, or per recipient to enforce budget discipline.

### 👁️ Complete Transparency
All treasury operations are visible and auditable on the Bitcoin Cash blockchain. Every vault, proposal, approval, and payout is recorded immutably.

### 🔐 Non-Custodial Security
You maintain full control of your private keys. FlowGuard never takes custody of funds — everything is enforced by on-chain covenants.

### ⚡ Powered by Layla CHIPs
Built for Bitcoin Cash's advanced covenant technology:
- **Loops**: Automated recurring execution
- **P2S**: Direct covenant enforcement
- **Bitwise**: Efficient state encoding
- **Functions**: Modular contract logic

**Current Status**: We've got a working version on chipnet right now. The basic multisig contract is deployed and handling real transactions. The advanced contracts using all four Layla CHIPs are written and tested, but they're waiting for the CHIPs to activate on chipnet (November 2025).

## 🏗️ Architecture

FlowGuard is a full-stack application consisting of three layers:

```
┌─────────────────────────────────────────┐
│         Frontend (React + TS)           │
│  Wallet connection, UI, tx signing      │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│     Backend API (Node.js + SQLite)      │
│  Indexing, query APIs, state mirroring  │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│   On-Chain (CashScript Covenants)       │
│  Treasury rules, enforcement, custody   │
└─────────────────────────────────────────┘
```

### Project Structure

```
flowguard/
├── contracts/          # CashScript smart contracts (Layla CHIPs)
├── frontend/           # React + TypeScript frontend
│   ├── src/
│   │   ├── components/ # UI components
│   │   ├── pages/      # Page components
│   │   ├── hooks/      # React hooks (wallet, etc.)
│   │   ├── services/   # Wallet connectors, API clients
│   │   └── utils/      # Utilities and helpers
│   └── public/         # Static assets
├── backend/            # Express.js + SQLite backend
│   ├── src/
│   │   ├── routes/     # API routes
│   │   ├── database/   # Database schema and queries
│   │   └── index.ts    # Entry point
│   └── Dockerfile      # Production Docker image
└── docs/               # Documentation
```

## 🚀 Quick Start

### Prerequisites

- **Node.js 18+** and **pnpm** installed
- **BCH Wallet Extension**: [Paytaca](https://www.paytaca.com/) or [Badger Wallet](https://badger.bitcoin.com/)
- **Chipnet BCH**: Get testnet BCH from the [Chipnet Faucet](https://tbch.googol.cash/)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/flowguard.git
   cd flowguard
   ```

2. **Install dependencies**
   ```bash
   # Install all workspace dependencies
   pnpm install
   ```

3. **Start the backend**
   ```bash
   cd backend
   pnpm dev
   ```
   Backend will run at `http://localhost:3001`

4. **Start the frontend**
   ```bash
   cd frontend
   pnpm dev
   ```
   Frontend will run at `http://localhost:5173`

5. **Connect your wallet**
   - Open `http://localhost:5173` in your browser
   - Click "Connect Wallet" and select your BCH wallet extension
   - Approve the connection

6. **Create your first vault**
   - Navigate to "Create Vault"
   - Fill in vault details (name, deposit, unlock schedule, signers)
   - Sign the transaction
   - Your vault is now live on-chain!

## 📦 Deployment

### Backend (fly.io)

The backend is deployed on fly.io:

```bash
cd backend

# Install flyctl
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly deploy
```

Production API: `https://flowguard-backend.fly.dev`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.

### Frontend (Vercel)

The frontend is deployed on Vercel:

```bash
cd frontend

# Install Vercel CLI
npm i -g vercel

# Deploy
vercel
```

## 🔧 Environment Variables

### Backend (.env)

```bash
PORT=3001
BCH_NETWORK=chipnet
DATABASE_PATH=./data/flowguard.db
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:3001/api  # Development
# Production: https://flowguard-backend.fly.dev/api
```

## 🧪 Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **TailwindCSS** - Styling
- **React Router** - Client-side routing
- **Lucide Icons** - Icon library

### Backend
- **Node.js** - Runtime
- **Express.js** - Web framework
- **SQLite** / **better-sqlite3** - Database
- **TypeScript** - Type safety

### Smart Contracts
- **CashScript** - Contract language
- **FlowGuardDemo.cash** - Working multisig treasury (deployed on chipnet)
- **Layla CHIPs** - Advanced contracts ready (loops.cash, FlowGuard.cash, bitwise.cash, functions.cash)

### Infrastructure
- **fly.io** - Backend hosting
- **Vercel** - Frontend hosting
- **Docker** - Containerization

## 📖 Documentation

- [**User Documentation**](./frontend/src/pages/DocsPage.tsx) - Guides for creating vaults, proposals, and managing treasuries
- [**Deployment Guide**](./docs/DEPLOYMENT.md) - Deploy contracts and services to chipnet
- [**Next Steps**](./docs/NEXT_STEPS.md) - Post-deployment testing and usage guide
- [**Testing Guide**](./docs/TESTING.md) - How to test contract functions
- [**API Reference**](./docs/API.md) - Backend API endpoints
- [**Architecture**](./docs/ARCHITECTURE.md) - System design and architecture
- [**Product Requirements**](./docs/PRD.md) - Product requirements and roadmap

## 🤝 Use Cases

### DAOs & Communities
Manage community treasuries with transparent governance and recurring contributor payments.

### Open Source Projects
Automate bug bounty funds and development grants with maintainer approval requirements.

### Crypto Startups
Handle payroll and operational expenses with board approval and spending caps.

## 🔐 Security

### Non-Custodial Design
FlowGuard never takes custody of funds. All BCH is locked in on-chain covenants that only you and your signers control.

### Multi-Signature Approval
Proposals require M-of-N approvals, preventing single-point-of-failure attacks. Even if one key is compromised, funds remain safe.

### On-Chain Enforcement
All treasury rules are enforced by Bitcoin Cash consensus, not by backend services or trust assumptions.

### Open Source
All contract code is open source and auditable. No black boxes, no hidden logic.

⚠️ **Testnet Notice**: FlowGuard is currently deployed on Bitcoin Cash chipnet (testnet). Do not use real funds. Contracts have not been formally audited.

## 🏆 Chipnet Track & Layla CHIPs

We're participating in the Chipnet Track and have implemented all four Layla CHIPs:

### 📅 CHIP Activation Timeline
All Layla CHIPs activate on:
- **Chipnet**: November 15, 2025
- **Mainnet**: May 15, 2026

Source: [BCH Loops](https://github.com/bitjson/bch-loops), [BCH Bitwise](https://github.com/bitjson/bch-bitwise), [BCH P2S](https://github.com/bitjson/bch-p2s), [BCH Functions](https://github.com/bitjson/bch-functions)

### What's Live Right Now

**FlowGuardEnhanced.cash** - Our working multisig treasury contract
- Deployed on BCH chipnet and handling real transactions
- Multi-signature approvals (you can configure 2-of-3, 3-of-3, etc.)
- Full workflow: create vault → make proposals → get approvals → execute payouts
- Automatic balance tracking (checks every 30 seconds)
- Transaction history with links to blockchain explorers
- Wallet integration with Paytaca, Badger, and mainnet.cash

You can actually use this right now on chipnet. It's not just a demo - it's a real working system.

### The Advanced Contracts (Ready to Deploy)

We've written contracts that use all four Layla CHIPs. They're tested and ready, but waiting for the CHIPs to activate.

**Loops** (`loops.cash`) - For automated recurring unlocks
- Uses OP_BEGIN / OP_UNTIL to handle time-based cycles
- Calculates which unlock cycle we're in automatically
- No manual triggers needed - it just works on schedule

**Bitwise** (`bitwise.cash`) - For efficient state management  
- Uses bitwise operations to pack state into smaller transactions
- Tracks cycles, proposals, and approvals in a compact format
- Saves on transaction fees by reducing data size

**P2S** (`FlowGuard.cash`) - Direct covenant addressing
- No P2SH wrapper needed - direct locking bytecode
- More secure and flexible than traditional P2SH
- Supports larger token commitments if needed

**Functions** (`functions.cash`) - Modular contract logic
- Reusable functions for common operations
- Cleaner code, easier to audit
- Functions like `hasApproval()`, `isSigner()`, `isAllowedSpending()`

Once the CHIPs activate, we'll deploy these and they'll make the system more efficient and powerful. But the current version works great for now.

## 🛣️ Roadmap

### What We've Built So Far

We've got a working MVP on chipnet right now. You can create vaults, make proposals, get approvals, and execute payouts - all on-chain. The basic multisig contract is deployed and handling real transactions.

**What's Working:**
- Multi-signature vault creation with on-chain deployment
- Real-time balance monitoring every 30 seconds
- Proposal workflow (create → approve → execute)
- Wallet integration with Paytaca, Badger, and mainnet.cash
- Transaction confirmation modals for better UX
- Full transaction history with explorer links
- Deposit flow with automatic balance updates

**The Advanced Contracts:**
We've written contracts that use all four Layla CHIPs (Loops, Bitwise, P2S, Functions), but they're waiting for the CHIPs to activate on chipnet. Once that happens in November 2025, we'll deploy them and migrate existing vaults.

### What's Next

**Before CHIP Activation (Now - Nov 2025):**
- Polish the UI/UX based on user feedback
- Add more wallet options (mobile wallets, hardware wallets)
- Improve error handling and edge cases
- Write better documentation for end users
- Maybe add some analytics so teams can track their spending

**After CHIP Activation (Nov 2025 - May 2026):**
- Deploy the advanced contracts that use Loops, Bitwise, P2S, and Functions
- Migrate existing vaults to the new contracts (we'll make this seamless)
- Enable true automated recurring unlocks (right now it's manual triggers)
- Optimize transaction sizes with bitwise state compression
- Test everything thoroughly on chipnet before mainnet

**Mainnet Launch (May 2026+):**
- Get a proper security audit (this is important for real money)
- Deploy to mainnet once CHIPs activate there
- Build out mobile support
- Add more advanced features like spending categories, budgets, etc.
- Maybe integrate with other BCH tools in the ecosystem

**Long Term:**
- Governance features for DAOs
- Integration with other DeFi protocols on BCH
- Multi-currency support (if tokens become a thing)
- Whatever the community asks for

We're building this in the open, so if you have ideas or want to contribute, jump in! The roadmap is flexible and we're always open to feedback.

## 🤝 Contributing

We'd love your help! This is a community project and we're always looking for contributors.

Here's how to get started:
1. Fork the repo and clone it
2. Create a branch for your changes
3. Make your changes (and test them!)
4. Open a pull request with a clear description

We're especially interested in:
- Bug fixes and improvements
- UI/UX enhancements
- Documentation improvements
- Testing and edge case handling
- New features that make sense for treasury management

If you're not sure where to start, check the issues or just ask. We're friendly!


## 📄 License

MIT License - see [LICENSE](./LICENSE) file for details.

## 🔗 Links

- **Website**: [Coming Soon]
- **Documentation**: [/docs](https://flowguard.app/docs)
- **GitHub**: [flowguard](https://github.com/yourusername/flowguard)
- **Twitter**: [@FlowGuardBCH](https://twitter.com/FlowGuardBCH)

## 🙏 Acknowledgments

- **Design Inspiration**: [Loop Crypto](https://www.loopcrypto.xyz/) and [Safe.global](https://safe.global/)
- **Technology**: Bitcoin Cash community and Layla CHIPs developers
- **Wallets**: Paytaca and Badger Wallet teams

---

<p align="center">
  Built for the Bitcoin Cash ecosystem
</p>
