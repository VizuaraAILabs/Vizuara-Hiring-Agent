@echo off
setlocal

for /f "usebackq eol=# tokens=1,* delims==" %%A in (".env.production") do (
  set "%%A=%%B"
)

npm.cmd --workspace apps/web run dev
