$ErrorActionPreference = 'Stop'
$revision = '00d96f7f18894055e7f1db44fa0df6462e5e4c8a'
$models = [ordered]@{
    bulbasaur = '001'
    charmander = '004'
    squirtle = '007'
    pikachu = '025'
    eevee = '133'
}
$destination = Join-Path $PSScriptRoot 'app/src/main/assets/web/models'
New-Item -ItemType Directory -Force $destination | Out-Null
foreach ($model in $models.GetEnumerator()) {
    $target = Join-Path $destination ($model.Key + '.glb')
    $temporary = $target + '.download'
    try {
        $url = "https://raw.githubusercontent.com/06wj/pokemon/$revision/public/models/$($model.Value)/model.glb"
        Invoke-WebRequest -UseBasicParsing $url -OutFile $temporary
        Move-Item -LiteralPath $temporary -Destination $target -Force
        Write-Host "Downloaded $($model.Key).glb"
    } finally {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
    }
}
