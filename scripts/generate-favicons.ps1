param(
    [Parameter(Mandatory = $true)][string]$SourceImage,
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

Add-Type -AssemblyName System.Drawing

$sourcePath = [System.IO.Path]::GetFullPath($SourceImage)
$outputPath = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($outputPath) | Out-Null

$source = [System.Drawing.Bitmap]::FromFile($sourcePath)

function New-FaviconBitmap([int]$size) {
    $coverage = if ($size -le 16) { 0.82 } elseif ($size -le 48) { 0.86 } else { 0.90 }
    $markSize = [Math]::Max(1, [int][Math]::Round($size * $coverage))
    $offset = [int][Math]::Floor(($size - $markSize) / 2)

    $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $canvas.SetResolution(96, 96)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::White)
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $centerX = [int][Math]::Round($source.Width * 0.5)
    $centerY = [int][Math]::Round($source.Height * 0.476)
    $cropSize = [int][Math]::Round([Math]::Min($source.Width, $source.Height) * 0.748)
    $sourceRect = New-Object System.Drawing.Rectangle(
        ($centerX - [int][Math]::Floor($cropSize / 2)),
        ($centerY - [int][Math]::Floor($cropSize / 2)),
        $cropSize,
        $cropSize
    )
    $destinationRect = New-Object System.Drawing.Rectangle($offset, $offset, $markSize, $markSize)
    $clipPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $clipPath.AddEllipse($destinationRect)
    $graphics.SetClip($clipPath)
    $graphics.DrawImage($source, $destinationRect, $sourceRect, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.ResetClip()

    $clipPath.Dispose()
    $graphics.Dispose()
    return $canvas
}

$sizes = [ordered]@{
    "favicon-16x16.png" = 16
    "favicon-32x32.png" = 32
    "favicon-48x48.png" = 48
    "android-chrome-192x192.png" = 192
    "android-chrome-512x512.png" = 512
    "apple-touch-icon.png" = 180
}

$pngBytes = @{}
foreach ($item in $sizes.GetEnumerator()) {
    $bitmap = New-FaviconBitmap $item.Value
    $target = Join-Path $outputPath $item.Key
    $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    if ($item.Value -in @(16, 32, 48)) {
        $pngBytes[$item.Value] = [System.IO.File]::ReadAllBytes($target)
    }
    $bitmap.Dispose()
}

$icoPath = Join-Path $outputPath "favicon.ico"
$stream = [System.IO.File]::Open($icoPath, [System.IO.FileMode]::Create)
$writer = New-Object System.IO.BinaryWriter($stream)
$iconSizes = @(16, 32, 48)
$writer.Write([uint16]0)
$writer.Write([uint16]1)
$writer.Write([uint16]$iconSizes.Count)
$dataOffset = 6 + (16 * $iconSizes.Count)
foreach ($size in $iconSizes) {
    $data = $pngBytes[$size]
    $writer.Write([byte]$size)
    $writer.Write([byte]$size)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$data.Length)
    $writer.Write([uint32]$dataOffset)
    $dataOffset += $data.Length
}
foreach ($size in $iconSizes) {
    $writer.Write($pngBytes[$size])
}
$writer.Dispose()
$stream.Dispose()
$source.Dispose()
