@echo off
echo Starting DeadSight...
start "" http://localhost:8000/index.html
python -m http.server 8000
echo note; game will exit upon closing this window
pause