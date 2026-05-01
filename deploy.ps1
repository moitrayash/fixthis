# Fix This — one-click deploy script
# Right-click this file -> "Run with PowerShell"
#   or from PowerShell:  .\deploy.ps1

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host ""
Write-Host "=== FIX THIS  -  one-shot deploy ===" -ForegroundColor Red
Write-Host ""

if (-not (Test-Path "index.html")) {
  Write-Host "ERROR: index.html not found. Run this script from inside the Fixthis.com folder." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

# Heal a broken .git dir if it exists (Cowork sandbox can leave one behind)
if (Test-Path ".git") {
  $cfgOk = Test-Path ".git/config"
  if ($cfgOk) {
    $sz = (Get-Item ".git/config").Length
    if ($sz -lt 30) { $cfgOk = $false }
  }
  if (-not $cfgOk) {
    Write-Host "Existing .git directory is broken. Removing and re-initing..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force ".git"
  }
}

if (-not (Test-Path ".git")) {
  Write-Host "Initializing git repo..." -ForegroundColor Cyan
  git init -b main | Out-Null
  if (-not $?) { throw "git init failed - install git from git-scm.com" }
}

if (-not (git config user.name 2>$null)) {
  git config user.name "Yash Moitra"
  git config user.email "yashmoitratales@gmail.com"
}

Write-Host "Staging files..." -ForegroundColor Cyan
git add -A
$staged = git diff --cached --name-only | Measure-Object | Select-Object -ExpandProperty Count
Write-Host "  $staged file(s) staged"

if ($staged -gt 0) {
  $msg = "Update fixthis.com - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
  git commit -m $msg | Out-Null
  Write-Host "  Committed: $msg"
} else {
  Write-Host "  Nothing new to commit"
}

if (-not (git remote get-url origin 2>$null)) {
  Write-Host "Adding remote -> github.com/moitrayash/fixthis" -ForegroundColor Cyan
  git remote add origin https://github.com/moitrayash/fixthis.git
}

Write-Host "Pushing to GitHub..." -ForegroundColor Cyan
Write-Host "  (you may be prompted for GitHub credentials - use a Personal Access Token, not your password)"
git push -u origin main 2>&1
if (-not $?) {
  Write-Host ""
  Write-Host "Push failed. Common fixes:" -ForegroundColor Yellow
  Write-Host "  1. Authenticate:  gh auth login   (install GitHub CLI from cli.github.com)"
  Write-Host "  2. Or create a PAT: github.com/settings/tokens (classic, with 'repo' scope)"
  Write-Host "  3. Or set up SSH:   ssh-keygen -t ed25519 -C 'you@example.com'"
  Read-Host "Press Enter to close"; exit 1
}

Write-Host ""
Write-Host "=== DEPLOYED ===" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. github.com/moitrayash/fixthis/settings/pages"
Write-Host "     -> Set Source: Branch 'main', folder '/'"
Write-Host "     -> Save. Wait ~60s for Pages to build."
Write-Host "  2. In Wix DNS:"
Write-Host "     -> Add CNAME record: fixthis -> moitrayash.github.io"
Write-Host "  3. Open: https://fixthis.yashmoitra.com"
Write-Host ""
Read-Host "Press Enter to close"
