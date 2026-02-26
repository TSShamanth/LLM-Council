# ── Council of LLMs — Spring Boot Startup Script ──────────────────
# Reads API keys from ../.env and starts the Spring Boot server.
# Usage: .\start.ps1

$envFile = Join-Path $PSScriptRoot "..\.env"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: .env file not found at $envFile" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "  COUNCIL OF LLMs — Loading environment" -ForegroundColor Cyan
Write-Host "  ─────────────────────────────────────" -ForegroundColor DarkGray

# Parse .env file and set environment variables
Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    # Skip comments and empty lines
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $val, "Process")
            # Mask the value for display
            $masked = if ($val.Length -gt 8) { $val.Substring(0,4) + "..." + $val.Substring($val.Length-3) } else { "***" }
            Write-Host "  ✅ $key = $masked" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "  Starting Spring Boot on port 3002..." -ForegroundColor Yellow
Write-Host ""

# Start Spring Boot
mvn spring-boot:run
