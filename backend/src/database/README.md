# Database Configuration

## SQLite Database

FlowGuard uses SQLite for data persistence. The database file is stored at the path specified by the `DATABASE_PATH` environment variable.

### Configuration

- **Default path**: `./flowguard.db` (development)
- **Docker path**: `/app/data/flowguard.db` (persistent volume)

### Docker Persistence

In Docker Compose, the SQLite database is stored in a persistent volume (`flowguard_sqlite_data`) mounted at `/app/data`. This ensures data persists across container restarts.

### Schema

The database schema is automatically initialized on startup. Tables include:
- `vaults` - Treasury vault information
- `proposals` - Spending proposals
- `cycles` - Time-locked cycle information
- `transactions` - Transaction history

### Migrations

Column migrations are automatically applied on startup. New columns are added to existing tables without data loss.
