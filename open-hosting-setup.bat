@echo off
setlocal
echo.
echo  PeerDisclosures - Open hosting setup pages
echo  ==========================================
echo.
echo  1. Render API (apply render.yaml from GitHub):
echo     https://dashboard.render.com/blueprint/new?repo=https://github.com/D-A-V-E1/peerdisclosures
echo.
echo  2. Vercel frontend (import repo):
echo     https://vercel.com/new/clone?repository-url=https://github.com/D-A-V-E1/peerdisclosures
echo.
echo  3. Supabase auth URLs:
echo     https://supabase.com/dashboard/project/cbqiqbcqzvfozewqzqnl/auth/url-configuration
echo.
echo  4. Stripe live webhooks:
echo     https://dashboard.stripe.com/webhooks
echo.
echo  After Render deploy, copy env from scripts\render-production-env.example
echo  After Vercel deploy, set env from .env.production.example
echo  DNS: docs\DNS_PEERDISCLOSURES.md
echo.
start "" "https://dashboard.render.com/blueprint/new?repo=https://github.com/D-A-V-E1/peerdisclosures"
timeout /t 2 >nul
start "" "https://vercel.com/new/clone?repository-url=https://github.com/D-A-V-E1/peerdisclosures"
endlocal
