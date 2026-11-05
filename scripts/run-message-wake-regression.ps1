param(
  [Parameter(Mandatory)][ValidateSet('canary-before-fix', 'focused', 'integration', 'typecheck')][string]$Stage
)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backend = Join-Path $root 'backend'
$evidence = Join-Path $root 'artifacts\hardening\message-wake-2026-11-06'
New-Item -ItemType Directory -Path $evidence -Force | Out-Null
$log = Join-Path $evidence "$Stage.log"
if (Test-Path -LiteralPath $log) { throw 'Refusing to overwrite historical test evidence' }
if (Test-Path -LiteralPath (Join-Path $backend '.env')) { throw 'Refusing to load a backend environment file' }
Get-ChildItem Env: | Where-Object { $_.Name -match '^(FIREBASE_|SMTP_|EMAIL_|RESEND_|BREVO_|POSTMARK_|SENTRY_|REDIS_|LIVEKIT_|MESSAGE_NOTIFICATION_)' } |
  ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:APP_ENV = 'test'
$env:DATABASE_URL = 'postgresql://fixture@127.0.0.1:55438/postgres'
$env:DATABASE_SSL = 'false'
$env:JWT_ISSUER = 'fixture-only'
$env:JWT_AUDIENCE = 'fixture-only'
$env:JWT_ACCESS_SECRET = 'fixture-access-secret-01234567890123456789'
$env:JWT_REFRESH_SECRET = 'fixture-refresh-secret-01234567890123456789'
$env:APP_BASE_URL = 'https://example.invalid'
$env:TSX_DISABLE_CACHE = '1'
$pg = 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe'
$data = 'C:\Users\ankit\Downloads\kryno-fresh\artifacts\hardening\notification-contract-local-2026-10-26\postgres-data'
$started = $false
$testExit = 1
Push-Location $backend
try {
  if ($Stage -eq 'integration') {
    if ((Get-Content -LiteralPath (Join-Path $data 'PG_VERSION') -Raw).Trim() -ne '17') { throw 'Unexpected fixture version' }
    if (Get-NetTCPConnection -LocalPort 55438 -State Listen -ErrorAction SilentlyContinue) { throw 'Fixture port already in use' }
    & $pg -D $data -l (Join-Path $evidence 'fixture-postgres.log') -o '-h 127.0.0.1 -p 55438 -c max_connections=20 -c shared_buffers=8MB' -w start
    if ($LASTEXITCODE -ne 0) { throw 'Disposable localhost fixture did not start' }
    $started = $true
  }
  $node = 'C:\Program Files\nodejs\node.exe'
  switch ($Stage) {
    'canary-before-fix' { & $node --import tsx --test --test-concurrency=1 '--test-name-pattern=relay-wake requires|removing a canary' src/services/push.ownership.test.ts 2>&1 | Tee-Object -FilePath $log }
    'focused' { & $node --import tsx --test --test-concurrency=1 src/config/messageRelayWake.test.ts src/services/push.ownership.test.ts src/services/messagePushDiagnostics.test.ts src/services/messages.delivery.test.ts src/services/devices.push.test.ts 2>&1 | Tee-Object -FilePath $log }
    'integration' { & $node --import tsx --test --test-concurrency=1 integration/message-notification-contract.test.ts 2>&1 | Tee-Object -FilePath $log }
    'typecheck' { & $node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit 2>&1 | Tee-Object -FilePath $log }
  }
  $testExit = $LASTEXITCODE
} finally {
  if ($started) {
    & $pg -D $data -m fast -w stop
    if ($LASTEXITCODE -ne 0) { $testExit = 1 }
  }
  Pop-Location
}
exit $testExit
