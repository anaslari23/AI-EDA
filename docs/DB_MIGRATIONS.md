# Backend DB Readiness (Postgres + Alembic)

## 1. Create role/database

```bash
psql -U postgres -f backend/scripts/setup_postgres.sql
```

## 2. Configure environment

Set either:
- `POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB/POSTGRES_HOST/POSTGRES_PORT`
- or `DATABASE_URL` (takes precedence)

## 3. Apply migrations

```bash
cd backend
alembic upgrade head
```

## 4. Optional auto-migrate on backend startup

Set:

```bash
AUTO_MIGRATE_ON_STARTUP=true
```

## 5. Verify

```bash
curl http://127.0.0.1:8000/health
```

Then project/circuit snapshot persistence endpoints should work.
