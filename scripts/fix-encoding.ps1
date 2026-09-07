# Repairs double-encoded UTF-8 characters (mojibake) introduced by PowerShell
# round-trips that read UTF-8 files as Windows-1252 and rewrote them.
$enc = New-Object System.Text.UTF8Encoding($false)

# mojibake sequences -> correct characters (built from code points)
$pairs = @(
  @([string][char]0xE2 + [char]0x201A + [char]0xB1, [string][char]0x20B1),  # â‚± -> ₱
  @([string][char]0xC2 + [char]0xB7,                 [string][char]0xB7),   # Â·  -> ·
  @([string][char]0xE2 + [char]0x80 + [char]0x94,    [string][char]0x2014), # â€” -> —
  @([string][char]0xE2 + [char]0x86 + [char]0x92,    [string][char]0x2192), # â†’ -> →
  @([string][char]0xE2 + [char]0x201A + [char]0x82,  [string][char]0x2082), # â‚‚ -> ₂
  @([string][char]0xE2 + [char]0x80 + [char]0x93,    [string][char]0x2013), # â€“ -> –
  @([string][char]0xE2 + [char]0x80 + [char]0xA6,    [string][char]0x2026)  # â€¦ -> …
)

$files = @(
  'src\app\home\index.tsx',
  'src\app\pages\reports.tsx',
  'src\app\pages\heatmap.tsx',
  'src\app\pages\energy.tsx',
  'src\app\pages\profile.tsx',
  'src\app\pages\schedule.tsx',
  'src\app\pages\about.tsx',
  'src\app\pages\device.tsx',
  'src\app\pages\accounts.tsx',
  'src\app\pages\preferences.tsx',
  'src\app\pages\edit-profile.tsx',
  'src\app\login.tsx',
  'src\app\signup.tsx',
  'src\app\forgot-password.tsx',
  'src\components\tile-loader.tsx'
)

$root = Join-Path $PSScriptRoot '..\BawatPiezaApp'
foreach ($f in $files) {
  $p = Join-Path $root $f
  if (-not (Test-Path $p)) { Write-Output "missing: $p"; continue }
  $t = [System.IO.File]::ReadAllText($p, $enc)
  $orig = $t
  foreach ($pair in $pairs) { $t = $t.Replace($pair[0], $pair[1]) }
  if ($t -ne $orig) {
    [System.IO.File]::WriteAllText($p, $t, $enc)
    Write-Output "fixed: $f"
  } else {
    Write-Output "clean:  $f"
  }
}
Write-Output 'done'
