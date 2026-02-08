@echo off
rem Task Tracker スクリプト
set SKILL_DIR=C:\Users\chatg\.clawdbot\skills\task-tracker

rem Node.jsのパスを設定
set NODE_PATH=C:\Users\chatg\AppData\Roaming\npm\node_modules\clawdbot
set PATH=%PATH%;C:\Users\chatg\.local\bin;C:\Users\chatg\.bun\bin;C:\WINDOWS\system32;C:\WINDOWS\System32\Wbem;C:\WINDOWS\System32\OpenSSH;C:\Program Files\Nodejs\;C:\Program Files\GitHub CLI\;C:\Program Files\Docker\Docker\resources\bin;C:\Program Files\Git\cmd;C:\Users\chatg\AppData\Local\Programs\Python\Python313\Scripts\;C:\Users\chatg\AppData\Roaming\npm;C:\Users\chatg\AppData\Local\Programs\Microsoft VS Code\bin;C:\Users\chatg\AppData\Local\Programs\Ollama\resources\app\bin

echo.
echo 🔧 Task Tracker 起動中...
echo.

rem タスク一覧を表示
node "%NODE_PATH%" "%SKILL_DIR%\index.js" list

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ✅ Task Tracker正常終了
)

pause
