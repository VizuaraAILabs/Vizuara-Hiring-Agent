@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=latest"

if /I not "%TARGET%"=="all" if /I not "%TARGET%"=="latest" (
  echo Usage: scripts\migrate-local.cmd [all^|latest]
  exit /b 1
)

if not exist ".env.local" (
  echo .env.local was not found in the repo root.
  exit /b 1
)

set "DATABASE_URL="
for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.local") do (
  if /I "%%A"=="DATABASE_URL" set "DATABASE_URL=%%B"
)

if not defined DATABASE_URL (
  echo DATABASE_URL was not found in .env.local.
  exit /b 1
)

set "PSQL_EXE=%PSQL_PATH%"
if not defined PSQL_EXE (
  for %%P in (
    "%ProgramFiles%\PostgreSQL\17\bin\psql.exe"
    "%ProgramFiles%\PostgreSQL\16\bin\psql.exe"
    "%ProgramFiles%\PostgreSQL\15\bin\psql.exe"
    "%ProgramFiles%\PostgreSQL\14\bin\psql.exe"
  ) do (
    if exist "%%~P" if not defined PSQL_EXE set "PSQL_EXE=%%~P"
  )
)

if not defined PSQL_EXE set "PSQL_EXE=psql.exe"

if /I "%TARGET%"=="latest" (
  set "LATEST_MIGRATION="
  for %%F in ("database\migrations\*.sql") do (
    set "LATEST_MIGRATION=%%~fF"
  )

  if not defined LATEST_MIGRATION (
    echo No Postgres migrations found.
    exit /b 1
  )

  echo Running !LATEST_MIGRATION!
  "!PSQL_EXE!" "!DATABASE_URL!" -v ON_ERROR_STOP=1 -f "!LATEST_MIGRATION!"
  exit /b !errorlevel!
)

for %%F in ("database\migrations\*.sql") do (
  echo Running %%~nxF
  "!PSQL_EXE!" "!DATABASE_URL!" -v ON_ERROR_STOP=1 -f "%%~fF"
  if errorlevel 1 exit /b !errorlevel!
)

echo Migrations complete.
