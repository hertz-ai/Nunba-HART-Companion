# PowerShell equivalent of run_python_inproc.sh — for Windows dev boxes.
$ErrorActionPreference = 'Stop'

$Repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $Repo

$Target = if ($args.Count -gt 0) { $args[0] } else { 'tests/journey' }

Write-Host '>>> Cleaning prior coverage data...'
Get-ChildItem -Path . -Filter '.coverage*' -Force -ErrorAction SilentlyContinue |
    Remove-Item -Force -ErrorAction SilentlyContinue
Remove-Item 'tests/coverage/python/htmlcov' -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item 'tests/coverage/python/coverage.xml' -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path 'tests/coverage/python' -Force | Out-Null

Write-Host ">>> Running pytest under coverage against: $Target"
$PytestExit = 0
try {
    python -X utf8 -m coverage run `
        --rcfile=.coveragerc `
        --parallel-mode `
        -m pytest $Target `
            -v `
            -p no:randomly `
            --timeout=60 `
            --no-cov `
            -ra
} catch {
    $PytestExit = $LASTEXITCODE
}

Write-Host '>>> Combining parallel-mode coverage fragments...'
python -m coverage combine --rcfile=.coveragerc

Write-Host '>>> Emitting reports...'
python -m coverage html --rcfile=.coveragerc `
    --directory=tests/coverage/python/htmlcov `
    --skip-covered --skip-empty
python -m coverage xml --rcfile=.coveragerc `
    -o tests/coverage/python/coverage.xml
python -m coverage json --rcfile=.coveragerc `
    -o tests/coverage/python/coverage.json

Write-Host '>>> Coverage summary:'
python -m coverage report --rcfile=.coveragerc --skip-covered --skip-empty

Write-Host '>>> Done.  HTML: tests/coverage/python/htmlcov/index.html'
exit $PytestExit
