$ErrorActionPreference = 'Stop'
$project = 'C:\Users\ankit\Downloads\movies\Balti\project\kryno-fresh'
$cloudflared = Join-Path $project 'cloudflared.exe'
$log = Join-Path $project 'cloudflared-live.log'

Set-Location $project

if (Test-Path $log) {
  Remove-Item $log -Force
}

$command = "`"$cloudflared`" tunnel --url http://127.0.0.1:8080 --no-autoupdate --protocol http2 >> `"$log`" 2>&1"
& cmd.exe /c $command
