# StudentOps AI — Start Dev (Backend + Frontend)
$repoRoot = $PSScriptRoot
$backendPath = Join-Path $repoRoot "backend"
$frontendPath = Join-Path $repoRoot "frontend"

# Start backend in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendPath'; uv run uvicorn main:app --reload --host 127.0.0.1 --port 8000" -WindowStyle Normal

# Give backend 2 seconds to bind
Start-Sleep -Seconds 2

# Start frontend in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$frontendPath'; npm run dev" -WindowStyle Normal

Write-Host ""
Write-Host "StudentOps AI starting..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  Backend  ->  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host "  Frontend ->  http://localhost:5173" -ForegroundColor Green
Write-Host "  API Docs ->  http://127.0.0.1:8000/docs" -ForegroundColor Yellow
Write-Host ""
Write-Host "Open http://localhost:5173 in your browser." -ForegroundColor White
