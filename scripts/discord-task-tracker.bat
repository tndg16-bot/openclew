@echo off
rem Task Tracker 起動スクリプト
rem Clawdbotから起動するためのラッパー

set SKILL_DIR=C:\Users\chatg\.clawdbot\skills\task-tracker
set SCRIPT_PATH=%SKILL_DIR%\run-task-tracker.bat

rem Discord通知用の簡易的なメッセージ送信
echo "Task Tracker: タスク一覧" > "%TEMP%\task-tracker-discord.txt"

rem Clawdbotのコマンドラインツールを使用してタスク一覧を表示
rem Clawdbot CLIのスキルインストールパスが不明なため、直接nodeで実行
cd /d "%SKILL_DIR%" && node index.js list > "%TEMP%\task-tracker-output.txt"

rem Discordへ通知（ClawdbotがDiscord統合されている場合は）
rem この部分はClawdbotのDiscord APIを使用して実装する機能です

echo.
echo 📝 Task Trackerを実行しました

if exist "%TEMP%\task-tracker-output.txt" (
    type "%TEMP%\task-tracker-output.txt"
)

echo.
echo 終了：タスク一覧を表示
pause
