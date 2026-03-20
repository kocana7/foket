@echo off
echo Foket 서버 시작 중...

:: API 서버 (포트 4000)
start "foket-api" cmd /k "cd /d C:\foket\api && node server.js"

:: Webhook 서버 (포트 4001)
start "foket-webhook" cmd /k "cd /d C:\foket\api && node webhook.js"

:: ngrok 터널 (GitHub Webhook 수신)
start "foket-ngrok" cmd /k "cd /d C:\foket && ngrok.exe http 4001"

echo.
echo [완료] 서버가 시작됐습니다.
echo   API:     http://localhost:4000
echo   Webhook: http://localhost:4001
echo   ngrok:   http://localhost:4040 (대시보드)
echo.
echo [주의] ngrok URL이 바뀌면 GitHub Webhook 설정을 업데이트해야 합니다.
echo   GitHub > Settings > Webhooks
echo.
pause
