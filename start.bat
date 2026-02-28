@echo off
setlocal

title ARCHIPEL RECOVERY BOOT
cls
cd /d "%~dp0"

echo [1/3] NETTOYAGE DES PORTS...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3000') do taskkill /F /PID %%p >nul 2>&1
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :7777') do taskkill /F /PID %%p >nul 2>&1

set "PY=python"
python -V >nul 2>&1
if errorlevel 1 (
  py -V >nul 2>&1
  if errorlevel 1 (
    echo [!] Python introuvable. Installe Python puis relance.
    pause
    exit /b 1
  )
  set "PY=py"
)

echo [2/3] VERIFICATION DES DEPENDANCES...
%PY% -c "import nacl" >nul 2>&1
if errorlevel 1 (
  echo [!] Installation de PyNaCl...
  pip install pynacl --quiet
)

if not exist "node_modules" (
  echo [!] Installation des modules Node...
  npm.cmd install --quiet
)

echo [3/3] DEMARRAGE SYSTEME...
%PY% src\identity\la_cle.py
if errorlevel 1 (
  echo [!] Erreur generation des cles.
  pause
  exit /b 1
)

start "" http://localhost:3000
node index.js
pause
