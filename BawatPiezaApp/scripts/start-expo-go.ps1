<#
.SYNOPSIS
    Preflight checks + Expo dev server start, tuned for testing in Expo Go.

.DESCRIPTION
    `npm run android` (expo start --android) reaches the device through adb, so on
    a machine without the Android SDK / platform-tools it dies with:

        Failed to resolve the Android SDK path. Default install location not found: ...\Android\Sdk
        Error: 'adb' is not recognized as an internal or external command

    Expo Go needs none of that: the Expo Go app runs on the phone and pulls the
    bundle from the Metro dev server over the network. This script checks the
    things that actually break that flow -- missing .env, a localhost API URL,
    a busy port, a missing tunnel helper -- prints the QR steps, then starts
    `expo start`.

.PARAMETER Tunnel
    Serve the bundle through an ngrok tunnel. Use it when the phone and the PC
    are not on the same network, or when the Wi-Fi blocks device-to-PC traffic.

.PARAMETER Clear
    Start Metro with a cleared cache (expo start --clear).

.PARAMETER Check
    Run the preflight checks and exit without starting Metro.

.PARAMETER Port
    Dev server port. Default 8081.

.EXAMPLE
    ./scripts/start-expo-go.ps1
    ./scripts/start-expo-go.ps1 -Check
    ./scripts/start-expo-go.ps1 -Tunnel
    ./scripts/start-expo-go.ps1 -Clear -Port 8082
#>
[CmdletBinding()]
param(
    [switch]$Tunnel,
    [switch]$Clear,
    [switch]$Check,
    [int]$Port = 8081
)

$ErrorActionPreference = 'Stop'
# Keep the launcher output readable when it runs from npm (no progress bars).
$ProgressPreference = 'SilentlyContinue'

# scripts/ lives inside BawatPiezaApp/, so the app root is the parent folder.
$appDir = Split-Path -Parent $PSScriptRoot
Set-Location $appDir

$problems = @()

function Write-Head { param([string]$Message) Write-Host ''; Write-Host $Message -ForegroundColor White }
function Write-Ok { param([string]$Message) Write-Host ('  [ ok ] ' + $Message) -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host ('  [info] ' + $Message) -ForegroundColor Cyan }
function Write-Warn { param([string]$Message) Write-Host ('  [warn] ' + $Message) -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host ('  [fail] ' + $Message) -ForegroundColor Red }

# Every IPv4 address a phone on the same Wi-Fi could reach.
function Get-LanIPv4 {
    $found = @()
    try {
        $found = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -ne '127.0.0.1' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Select-Object -ExpandProperty IPAddress)
    } catch {
        $found = @()
    }
    if (-not $found) {
        try {
            $found = @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
                Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
                ForEach-Object { $_.IPAddressToString } |
                Where-Object { $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*' })
        } catch {
            $found = @()
        }
    }
    return @($found | Select-Object -Unique)
}

Write-Head 'BawatPieza - Expo Go launcher'
Write-Info ('project: ' + $appDir)

# --------------------------------------------------------------- dependencies
Write-Head '1. Project'
if (-not (Test-Path (Join-Path $appDir 'node_modules'))) {
    Write-Fail 'node_modules/ is missing. Run: npm install'
    $problems += 'dependencies not installed'
} else {
    Write-Ok 'node_modules/ present'
}

# ------------------------------------------------------------------------ .env
Write-Head '2. Environment (.env)'
$envFile = Join-Path $appDir '.env'
$apiUrl = ''
if (-not (Test-Path $envFile)) {
    Write-Fail 'No .env file. Copy .env.example to .env and fill in the values.'
    $problems += '.env missing'
} else {
    $envText = Get-Content $envFile -Raw
    $requiredVars = @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_API_URL')
    foreach ($name in $requiredVars) {
        if ($envText -match ('(?m)^\s*' + $name + '\s*=\s*\S')) {
            Write-Ok ($name + ' set')
        } else {
            Write-Fail ($name + ' is empty or missing - the app throws at startup without it.')
            $problems += ($name + ' missing')
        }
    }
    $apiMatch = [regex]::Match($envText, '(?m)^\s*EXPO_PUBLIC_API_URL\s*=\s*(\S+)')
    if ($apiMatch.Success) { $apiUrl = $apiMatch.Groups[1].Value.Trim() }

    # EXPO_PUBLIC_* values are inlined when Metro starts: edits need a restart.
    Write-Info 'EXPO_PUBLIC_* values are baked in at start - restart Metro after editing .env.'
}

# ------------------------------------------------------------------ networking
Write-Head '3. Networking'
# @(...) keeps this an array even when only one address is found: without it
# PowerShell unwraps the single element to a string and [0] indexes a character.
$lanIPs = @(Get-LanIPv4)
if ($lanIPs.Count -gt 0) {
    Write-Ok ('PC LAN IP: ' + ($lanIPs -join ', '))
} else {
    Write-Warn 'Could not detect a LAN IP (no active network adapter?).'
}

# Prefer the address the backend already lives on: the phone must reach both
# Metro (this server) and the API (EXPO_PUBLIC_API_URL) over the same network.
$preferredIP = $null
if ($apiUrl -match '^https?://(\d{1,3}(?:\.\d{1,3}){3})') {
    $apiHost = $Matches[1]
    if ($lanIPs -contains $apiHost) { $preferredIP = $apiHost }
}
if (-not $preferredIP -and $lanIPs.Count -gt 0) { $preferredIP = $lanIPs[0] }

if ($apiUrl) {
    if ($apiUrl -match 'localhost|127\.0\.0\.1') {
        Write-Warn ('EXPO_PUBLIC_API_URL=' + $apiUrl + ' points at the phone itself once the app runs on a device.')
        if ($preferredIP) {
            Write-Info ('Use http://' + $preferredIP + ':4000 in BawatPiezaApp/.env, then restart Metro.')
        }
        $problems += 'EXPO_PUBLIC_API_URL is localhost'
    } else {
        Write-Ok ('EXPO_PUBLIC_API_URL=' + $apiUrl + ' (reachable from the phone)')
    }
    if ($Tunnel) {
        Write-Info 'Tunnel mode only tunnels Metro; the API URL above must still be reachable from the phone.'
    }
}

# The phone has to reach the API as well as Metro. Probing it from here catches
# a stopped backend or a missing firewall rule before the QR code is scanned.
if ($preferredIP) {
    $probeUrl = 'http://' + $preferredIP + ':4000/health'
    try {
        $probe = Invoke-WebRequest -Uri $probeUrl -TimeoutSec 5 -UseBasicParsing
        if ($probe.StatusCode -eq 200) {
            Write-Ok ('API answers on ' + $probeUrl)
        } else {
            Write-Warn ('API answered HTTP ' + $probe.StatusCode + ' on ' + $probeUrl)
        }
    } catch {
        Write-Warn ('No API answer from this PC on ' + $probeUrl)
        Write-Info 'Start it with:  cd ..\backend ; npm run dev'
        $problems += 'API not answering on the LAN address'
    }

    $apiRule = @(Get-NetFirewallRule -DisplayName 'BawatPieza API (TCP 4000)' -ErrorAction SilentlyContinue)
    if ($apiRule.Count -gt 0) {
        Write-Ok 'Inbound firewall rule for TCP 4000 present'
    } else {
        Write-Warn 'No inbound firewall rule for TCP 4000 - a phone may report "Cannot reach BawatPieza server"'
        Write-Info 'Fix once from an elevated PowerShell:  npm run allow-lan-api'
        Write-Info '(the PC itself always works, which is why the same URL opens in a browser here)'
    }
}

Write-Info 'The app resolves the API address at runtime (EXPO_PUBLIC_API_URL when set, otherwise this LAN IP),'
Write-Info 'so a stale IP in .env no longer breaks Android or iOS - only a blocked port still can.'

# ------------------------------------------------- android sdk / adb (optional)
Write-Head '4. Android tooling (only needed for --android / emulator)'
$sdkRoot = $env:ANDROID_HOME
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_SDK_ROOT }
if (-not $sdkRoot) { $sdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Get-Command adb -ErrorAction SilentlyContinue
if ($adb -and (Test-Path $sdkRoot)) {
    Write-Ok ('adb on PATH (' + $adb.Source + ') and SDK at ' + $sdkRoot)
    Write-Info 'npm run android will work with a connected device or a running emulator.'
} else {
    Write-Warn 'No Android SDK / adb detected - `npm run android` cannot start a device.'
    Write-Info 'Expo Go does not need it: the app is installed on the phone, not on this PC.'
    Write-Info 'For an emulator instead, install Android Studio (it sets ANDROID_HOME):'
    Write-Info 'https://docs.expo.dev/workflow/android-studio-emulator/'
}

# ---------------------------------------------------------------------- port
Write-Head ('5. Port ' + $Port)
$busy = $null
try {
    $busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
} catch {
    $busy = $null
}
if ($busy) {
    $busyPid = ($busy | Select-Object -First 1 -ExpandProperty OwningProcess)
    Write-Warn ('Port ' + $Port + ' is already in use (PID ' + $busyPid + ').')
    Write-Info 'Another Expo server may already be serving this project - reuse it, or run with -Port <other>.'
} else {
    Write-Ok ('Port ' + $Port + ' is free')
}

# -------------------------------------------------------------- tunnel helper
if ($Tunnel) {
    Write-Head '6. Tunnel helper (@expo/ngrok)'
    $ngrok = Join-Path $appDir 'node_modules\@expo\ngrok'
    if (Test-Path $ngrok) {
        Write-Ok '@expo/ngrok already installed'
    } else {
        Write-Info 'Installing @expo/ngrok locally (dev-only, not written to package.json)...'
        npm install --no-save --no-package-lock '@expo/ngrok@^4.1.0' | Out-Null
        if (Test-Path $ngrok) {
            Write-Ok '@expo/ngrok installed'
        } else {
            Write-Warn 'Install did not complete. Run: npm install --no-save @expo/ngrok@^4.1.0'
        }
    }
}

# --------------------------------------------------------------------- how-to
Write-Head 'How to open the app in Expo Go'
Write-Host '    1. Install "Expo Go" from the Play Store (Android) or the App Store (iOS).'
Write-Host '    2. Put the phone on the same Wi-Fi as this PC.'
Write-Host '    3. Start the dev server (this script does it) and scan the QR code:'
Write-Host '         Android -> open Expo Go and use "Scan QR code"'
Write-Host '         iOS     -> point the Camera app at the QR code'
if ($preferredIP) {
    Write-Host ('    4. Manual entry / "Enter URL manually":  exp://' + $preferredIP + ':' + $Port)
}
Write-Host '    QR never connects (guest Wi-Fi, AP isolation, VPN)? Use a tunnel:'
Write-Host '      npm run expo-go:tunnel'

if ($problems.Count -gt 0) {
    Write-Head 'Attention'
    foreach ($problem in $problems) { Write-Warn $problem }
}

if ($Check) {
    Write-Head 'Preflight only (-Check): Metro was not started.'
    exit 0
}

# ----------------------------------------------------------------- start metro
$expoArgs = @('expo', 'start', '--port', $Port)
if ($Tunnel) { $expoArgs += '--tunnel' }
if ($Clear) { $expoArgs += '--clear' }

Write-Head ('Starting: npx ' + ($expoArgs -join ' '))
Write-Host ''
& npx @expoArgs
exit $LASTEXITCODE


