# Pushes every non-empty variable from .env.local to Vercel for
# production / preview / development. Uses the local vercel.cmd binary
# directly because npx does not forward stdin to its child process.

$root    = Resolve-Path (Join-Path $PSScriptRoot "..")
$envFile = Join-Path $root ".env.local"
$vercel  = Join-Path $root "node_modules\.bin\vercel.cmd"

if (-not (Test-Path $envFile)) { Write-Error ".env.local not found"; exit 1 }
if (-not (Test-Path $vercel))  { Write-Error "vercel.cmd missing. Run: npm install"; exit 1 }

$envs = @("production", "preview", "development")

Get-Content $envFile | ForEach-Object {
  $line = $_.Trim()
  if (-not $line -or $line.StartsWith("#")) { return }
  $eq = $line.IndexOf("=")
  if ($eq -lt 1) { return }
  $name  = $line.Substring(0, $eq).Trim()
  $value = $line.Substring($eq + 1).Trim()
  if (-not $value) { Write-Host "  - skip $name (empty)"; return }

  foreach ($env in $envs) {
    Write-Host "  + $name -> $env"
    & $vercel env rm $name $env --yes 2>$null | Out-Null
    $value | & $vercel env add $name $env 2>&1 | Out-Null
  }
}

Write-Host ""
Write-Host "Done. Run: npx vercel --prod" -ForegroundColor Green
