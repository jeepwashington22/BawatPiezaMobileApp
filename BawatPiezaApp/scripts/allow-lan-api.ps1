<#
.SYNOPSIS
    Make the BawatPieza API reachable from Android / iOS devices on the same Wi-Fi.

.DESCRIPTION
    The Express API listens on port 4000 on this PC. Windows Firewall only lets
    other devices in when an inbound rule exists - the prompt that appears the
    first time Node listens is easy to dismiss (or to answer "Cancel"), and it
    grants the whole node.exe binary rather than the port. Without a rule the
    phone reports "Cannot reach BawatPieza server" while http://<LAN-IP>:4000
    still opens fine in the PC's own browser, because that traffic never leaves
    the machine.

    This script adds one deterministic inbound rule:

        BawatPieza API (TCP 4000)

    It is scoped to the local subnet (RemoteAddress LocalSubnet) on the Private
    and Public profiles, which covers home Wi-Fi, guest Wi-Fi and phone
    hotspots. Run it once per machine; re-running it is safe.

.PARAMETER Port
    API port. Default 4000 (backend/.env PORT).

.PARAMETER Check
    Report the current state (rule present, port listening, LAN URLs to test)
    and exit without changing anything.

.PARAMETER Remove
    Delete the rule again (needs the same admin rights).

.EXAMPLE
    npm run allow-lan-api
    ./scripts/allow-lan-api.ps1 -Check
    ./scripts/allow-lan-api.ps1 -Port 4000 -Remove
#>
[CmdletBinding()]
param(
    [int]$Port = 4000,
    [switch]$Check,
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'
# Keep the output readable when this runs from npm (no progress bars).
$ProgressPreference = 'SilentlyContinue'

$ruleName = 'BawatPieza API (TCP ' + $Port + ')'

function Write-Head { param([string]$Message) Write-Host ''; Write-Host $Message -ForegroundColor White }
function Write-Ok { param([string]$Message) Write-Host ('  [ ok ] ' + $Message) -ForegroundColor Green }
function Write-Info { param([string]$Message) Write-Host ('  [info] ' + $Message) -ForegroundColor Cyan }
function Write-Warn { param([string]$Message) Write-Host ('  [warn] ' + $Message) -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host ('  [fail] ' + $Message) -ForegroundColor Red }

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Every IPv4 address a phone on the same network could reach.
function Get-LanIPv4 {
    try {
        $found = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -ne '127.0.0.1' -and
                $_.IPAddress -notlike '169.254.*' -and
                $_.PrefixOrigin -ne 'WellKnown'
            } |
            Select-Object -ExpandProperty IPAddress)
        if ($found.Count -gt 0) { return @($found | Select-Object -Unique) }
    } catch {
        # fall through to the DNS fallback below
    }
    try {
        return @([System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
            Where-Object { $_.AddressFamily -eq 'InterNetwork' } |
            ForEach-Object { $_.IPAddressToString } |
            Where-Object { $_ -ne '127.0.0.1' -and $_ -notlike '169.254.*' } |
            Select-Object -Unique)
    } catch {
        return @()
    }
}

Write-Head 'BawatPieza API - LAN access for phones'
Write-Info ('port: ' + $Port)

$existing = @(Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)

# ---------------------------------------------------------------- remove mode
if ($Remove) {
    if (-not (Test-Administrator)) {
        Write-Fail 'Removing the rule needs an elevated PowerShell window.'
        Write-Info 'Right-click PowerShell -> "Run as administrator", then:'
        Write-Info ('  netsh advfirewall firewall delete rule name="' + $ruleName + '"')
        exit 1
    }
    if ($existing.Count -eq 0) {
        Write-Warn ('No rule named "' + $ruleName + '" - nothing to remove.')
        exit 0
    }
    $existing | Remove-NetFirewallRule
    Write-Ok ('Removed "' + $ruleName + '"')
    exit 0
}

# ------------------------------------------------------------------ diagnose
$listening = $false
try {
    $listening = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue).Count -gt 0
} catch {
    $listening = $false
}

$lanIPs = @(Get-LanIPv4)
$apiURLs = @($lanIPs | ForEach-Object { 'http://' + $_ + ':' + $Port })

Write-Head '1. Backend'
if ($listening) {
    Write-Ok ('Something is listening on port ' + $Port)
} else {
    Write-Warn ('Nothing is listening on port ' + $Port + ' yet.')
    Write-Info 'Start it with:  cd backend ; npm run dev'
}

Write-Head '2. Firewall rule'
if ($existing.Count -gt 0) {
    foreach ($rule in $existing) {
        Write-Ok ('"' + $rule.DisplayName + '" enabled=' + $rule.Enabled + ' profile=' + $rule.Profile + ' action=' + $rule.Action)
    }
} else {
    Write-Warn ('No inbound rule named "' + $ruleName + '" - other devices are likely blocked.')
}

Write-Head '3. Addresses a phone can use'
if ($apiURLs.Count -gt 0) {
    foreach ($url in $apiURLs) {
        $state = 'not verified'
        try {
            $response = Invoke-WebRequest -Uri ($url + '/health') -TimeoutSec 5 -UseBasicParsing
            if ($response.StatusCode -eq 200) { $state = 'answers /health from this PC' } else { $state = 'HTTP ' + $response.StatusCode }
        } catch {
            $state = 'no answer from this PC'
        }
        Write-Info ($url + '  ->  ' + $state)
    }
    Write-Info 'Open one of those URLs in the phone browser: JSON means the phone can reach the API.'
} else {
    Write-Warn 'No LAN IPv4 address found - connect this PC to Wi-Fi or Ethernet first.'
}

if ($Check) {
    Write-Head 'Check only (-Check): nothing was changed.'
    exit 0
}

if ($existing.Count -gt 0) {
    Write-Head 'Nothing to do: the rule already exists.'
    exit 0
}

# -------------------------------------------------------------------- add rule
if (-not (Test-Administrator)) {
    Write-Head 'Administrator rights required'
    Write-Fail 'This window is not elevated, so the firewall rule cannot be created.'
    Write-Info 'Option A - right-click PowerShell -> "Run as administrator", then:'
    Write-Info ('  cd ' + (Split-Path -Parent $PSScriptRoot))
    Write-Info '  npm run allow-lan-api'
    Write-Info 'Option B - paste this into an elevated prompt:'
    Write-Info ('  netsh advfirewall firewall add rule name="' + $ruleName + '" dir=in action=allow protocol=TCP localport=' + $Port + ' profile=private,public remoteip=localsubnet')
    exit 1
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description 'BawatPieza Express API - inbound HTTP from devices on the local network (development).' `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private, Public `
    -RemoteAddress LocalSubnet | Out-Null

Write-Ok ('Created inbound rule "' + $ruleName + '" (' + $Port + '/TCP, local subnet only)')
Write-Info 'Re-run with -Remove to delete it, or -Check to inspect it.'
Write-Info 'Reload the app on the phone; Profile -> Device should show all green.'
