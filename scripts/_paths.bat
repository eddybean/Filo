@echo off
chcp 65001 > nul
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

if exist "%LOCALAPPDATA%\fnm\fnm.exe" (
    set "PATH=%LOCALAPPDATA%\fnm;%PATH%"
    FOR /f "tokens=*" %%i IN ('"%LOCALAPPDATA%\fnm\fnm.exe" env --use-on-cd --shell cmd-exe 2^>nul') DO %%i
)
