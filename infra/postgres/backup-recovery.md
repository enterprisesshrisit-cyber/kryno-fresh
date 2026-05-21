# KRYNO Postgres Backup And Recovery Baseline

Recommended staging provider: Supabase Postgres or another managed Postgres provider with PITR.

## Required Controls

- Point-in-time recovery enabled for production.
- Daily logical backup export retained for at least 14 days in staging and 30 days in production.
- Monthly restore drill into a separate staging database.
- Database SSL required.
- Least-privilege app database role before paid launch.

## RPO / RTO

Staging:

- RPO: 24 hours.
- RTO: 4 hours.

Paid launch target:

- RPO: 1 hour or better.
- RTO: 1 hour or better.

## Manual Logical Backup

Use this only from a secure machine with `pg_dump` installed. Never commit backup files.

```powershell
$env:PGPASSWORD='REPLACE_WITH_DB_PASSWORD'
pg_dump `
  --host db.PROJECT_REF.supabase.co `
  --port 5432 `
  --username postgres `
  --dbname postgres `
  --format custom `
  --file ".\kryno-backup-$(Get-Date -Format yyyyMMdd-HHmmss).dump" `
  --no-owner `
  --no-privileges
```

## Restore Drill

Restore into a disposable database first:

```powershell
$env:PGPASSWORD='REPLACE_WITH_RESTORE_DB_PASSWORD'
pg_restore `
  --host db.RESTORE_PROJECT_REF.supabase.co `
  --port 5432 `
  --username postgres `
  --dbname postgres `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  ".\kryno-backup-YYYYMMDD-HHMMSS.dump"
```

Validation after restore:

- `npm run db:migrate` reports no migration drift.
- `/api/ready` works against restored database.
- Login, feed, media references, chat metadata, and billing entitlement reads work.

## Media Storage Recovery

For R2/S3:

- Enable bucket versioning if available.
- Keep lifecycle rules documented.
- Confirm profile media, posts, stories, and encrypted attachments can be read after restore.

## Do Not Launch Until

- PITR is enabled.
- A restore drill has been completed.
- Backup owner is assigned.
- Restore credentials are stored in the secret manager.
