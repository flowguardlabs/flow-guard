# FlowGuard Deployment Guide

## Architecture Overview

FlowGuard uses a **split deployment** architecture:

- **Frontend**: Deployed to **Vercel** (static site)
- **Backend**: Deployed to **Fly.io** (Express server)

This is necessary because:
- Vercel is optimized for static sites and serverless functions
- Vercel **cannot** run long-running Express servers
- The backend requires persistent connections for blockchain monitoring and cycle scheduling

## Local Development

### Running the Full Stack

From the root directory:

```bash
pnpm dev
```

This command:
1. Runs `frontend` dev server (Vite) on `http://localhost:5173`
2. Runs `backend` dev server (Express) on `http://localhost:3001`
3. Vite proxy forwards `/api/*` requests to `http://localhost:3001`

Both servers run in parallel using pnpm workspaces.

### Running Separately

**Backend only:**
```bash
cd backend
pnpm dev
# Runs on http://localhost:3001
```

**Frontend only:**
```bash
cd frontend
pnpm dev
# Runs on http://localhost:5173
# Note: API calls will fail unless backend is running
```

## Production Deployment

### Frontend (Vercel)

1. **Connect your repository** to Vercel
2. **Set root directory** to `frontend/`
3. **Configure environment variables**:
   ```
   VITE_API_URL=https://flow-guard.fly.dev/api
   VITE_BCH_NETWORK=chipnet
   ```
4. **Build settings**:
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Install command: `pnpm install`

**Important**: Vercel will only deploy the frontend as a static site. The backend must be deployed separately to Fly.io.

### Backend (Fly.io)

1. **Install Fly CLI**: `curl -L https://fly.io/install.sh | sh`
2. **Login**: `fly auth login`
3. **Deploy**:
   ```bash
   cd backend
   fly deploy
   ```

4. **Set environment variables**:
   ```bash
   fly secrets set BCH_NETWORK=chipnet
   fly secrets set PORT=3001
   fly secrets set DATABASE_PATH=/data/flowguard.db
   ```

5. **Verify deployment**:
   ```bash
   fly status
   fly logs
   ```

The backend will be available at `https://flow-guard.fly.dev`

### Connecting Frontend to Backend

The frontend automatically detects the production environment and uses the Fly.io backend URL:

- **Development**: Uses Vite proxy (`/api` → `localhost:3001`)
- **Production**: Uses `https://flow-guard.fly.dev/api` (or `VITE_API_URL` if set)

Set `VITE_API_URL` in Vercel environment variables to override the default.

## Why Not Vercel for Backend?

Vercel's limitations:
- ❌ No persistent processes (Express servers need to run continuously)
- ❌ No file system persistence (SQLite database needs persistent storage)
- ❌ Serverless functions have execution time limits (blockchain monitoring needs long-running processes)
- ❌ No background job support (cycle unlock scheduler needs to run continuously)

Fly.io advantages:
- ✅ Persistent processes (Express server runs continuously)
- ✅ Persistent volumes (SQLite database storage)
- ✅ Background jobs (cycle scheduler, blockchain monitor)
- ✅ Full Node.js runtime support

## Alternative Deployment Options

If you prefer a different setup:

### Option 1: Railway
- Can deploy both frontend and backend
- Supports persistent storage
- Simpler than split deployment

### Option 2: Render
- Can deploy both frontend and backend
- Supports background workers
- Good for monorepos

### Option 3: Self-Hosted
- Deploy backend to VPS (DigitalOcean, Linode, etc.)
- Deploy frontend to Vercel/Netlify
- Full control over infrastructure

## Environment Variables

### Frontend (Vercel)
- `VITE_API_URL` - Backend API URL (defaults to Fly.io URL in production)
- `VITE_BCH_NETWORK` - BCH network (chipnet, mainnet, etc.)
- `VITE_ELECTRON_CASH_RPC_URL` - Electron Cash RPC URL (optional)
- `VITE_ELECTRON_CASH_RPC_USER` - Electron Cash RPC user (optional)
- `VITE_ELECTRON_CASH_RPC_PASSWORD` - Electron Cash RPC password (optional)

### Backend (Fly.io)
- `BCH_NETWORK` - BCH network (chipnet, mainnet, testnet3, testnet4)
- `PORT` - Server port (default: 3001)
- `DATABASE_PATH` - SQLite database path (default: ./flowguard.db)

See `backend/ENV_CONFIG.md` and `frontend/ENV_CONFIG.md` for full details.

## Troubleshooting

### Frontend can't connect to backend
- Check `VITE_API_URL` is set correctly in Vercel
- Verify backend is running on Fly.io: `fly status`
- Check CORS settings in backend (should allow Vercel domain)

### Backend not starting
- Check Fly.io logs: `fly logs`
- Verify environment variables: `fly secrets list`
- Check database path is writable: `fly ssh console`

### Local development issues
- Ensure both frontend and backend are running
- Check Vite proxy configuration in `frontend/vite.config.ts`
- Verify backend is on port 3001: `lsof -i :3001`

