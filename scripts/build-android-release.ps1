param(
  [switch]$Clean,
  [string]$OutputDirectory = "$env:USERPROFILE\Downloads"
)

$ErrorActionPreference = 'Stop'

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$mobileRoot = [System.IO.Path]::GetFullPath((Join-Path $repoRoot 'mobile-kryno-ui-raw'))
$buildAlias = 'C:\KrynoBuild'

if (Test-Path -LiteralPath $buildAlias) {
  $aliasItem = Get-Item -LiteralPath $buildAlias -Force
  $aliasTarget = [System.IO.Path]::GetFullPath([string]$aliasItem.Target)

  if ($aliasItem.LinkType -ne 'Junction' -or $aliasTarget -ne $mobileRoot) {
    throw "$buildAlias exists but does not point to $mobileRoot. Remove or repair it before building."
  }
} else {
  New-Item -ItemType Junction -Path $buildAlias -Target $mobileRoot | Out-Null
}

$gradleWrapper = Join-Path $buildAlias 'android\gradlew.bat'
$gradleWorkingDirectory = Join-Path $buildAlias 'android'

if ($Clean) {
  & $gradleWrapper --no-daemon clean -p $gradleWorkingDirectory
  if ($LASTEXITCODE -ne 0) {
    throw 'Android clean failed.'
  }
}

& $gradleWrapper --no-daemon assembleRelease -p $gradleWorkingDirectory
if ($LASTEXITCODE -ne 0) {
  throw 'Android release build failed.'
}

$appConfig = Get-Content -LiteralPath (Join-Path $mobileRoot 'app.json') -Raw | ConvertFrom-Json
$version = [string]$appConfig.expo.version
$sourceApk = Join-Path $mobileRoot 'android\app\build\outputs\apk\release\app-release.apk'

if (-not (Test-Path -LiteralPath $sourceApk)) {
  throw "Release APK was not produced at $sourceApk."
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$destinationApk = Join-Path $OutputDirectory "kryno-$version-release.apk"
Copy-Item -LiteralPath $sourceApk -Destination $destinationApk -Force

Write-Output "APK=$destinationApk"
