<#
  print-thermal.ps1 — envia um recibo ESC/POS para a impressora térmica MPT-II.

  Chamado pelo route handler /api/pdv/print-thermal (lib/thermalPrinter.js).
  Recebe um JSON de "ops" (lista de segmentos: bytes crus de controle OU texto)
  e escreve direto na porta serial Bluetooth via CreateFile (Win32), porque:
    - O driver "Generic / Text Only" filtra bytes de controle (não serve p/ ESC/POS cru).
    - A classe gerenciada System.IO.Ports.SerialPort falha de abrir essa porta SPP.
    - CreateFile + FileStream escreve bytes crus sem exigir privilégio de admin.

  A codificação do texto é feita aqui (não no Node) com [Text.Encoding]::GetEncoding($Cp),
  garantindo acentos corretos em qualquer codepage sem hardcodar tabela de bytes.

  Códigos de saída:
    0 = ok                 2 = impressora não pareada (COM não encontrado pelo MAC)
    3 = falha ao abrir COM (impressora desligada/fora de alcance/porta em uso)
#>
param(
    [Parameter(Mandatory = $true)][string]$JsonPath,
    [string]$Mac  = '606E413CED28',
    [string]$Com  = '',
    [int]$Cp      = 850,
    [int]$EscT    = 2
)
$ErrorActionPreference = 'Stop'

# 1. Resolve a porta COM pelo MAC (a menos que forçada via -Com).
if ([string]::IsNullOrWhiteSpace($Com)) {
    $dev = Get-PnpDevice -Class Ports -ErrorAction SilentlyContinue |
        Where-Object { $_.InstanceId -match $Mac -and $_.FriendlyName -match '\(COM\d+\)' } |
        Select-Object -First 1
    if (-not $dev) { [Console]::Error.WriteLine('PRINTER_NOT_PAIRED'); exit 2 }
    $null = $dev.FriendlyName -match '\(COM(\d+)\)'
    $Com = "COM$($Matches[1])"
}

# 2. Monta o buffer de bytes a partir das ops.
# ReadAllText(UTF8) lê os acentos corretamente. NÃO envolver em @(): no PS 5.1
# ConvertFrom-Json devolve o array inteiro como um único objeto no pipeline, e
# @() o aninharia em [array-de-1] — o foreach iteraria 1x sobre o array todo.
$ops = [System.IO.File]::ReadAllText($JsonPath, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
$enc = [System.Text.Encoding]::GetEncoding($Cp)
$buf = [System.Collections.Generic.List[byte]]::new()
$buf.AddRange([byte[]](27, 64))            # ESC @  -> inicializa
$buf.AddRange([byte[]](27, 116, $EscT))    # ESC t n -> seleciona code page
foreach ($op in $ops) {
    if ($op.t -eq 'raw')      { $buf.AddRange([byte[]]($op.b)) }
    elseif ($op.t -eq 'txt')  { $buf.AddRange($enc.GetBytes([string]$op.s)) }
}

# 3. Abre a porta via CreateFile e escreve os bytes crus.
$sig = @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ComRaw {
  [DllImport("kernel32.dll", SetLastError=true, CharSet=CharSet.Unicode)]
  public static extern SafeFileHandle CreateFile(string n, uint a, uint s, IntPtr sec, uint c, uint f, IntPtr t);
}
'@
try { Add-Type -TypeDefinition $sig -ErrorAction Stop } catch {}

$h = [ComRaw]::CreateFile("\\.\$Com", 0x40000000, 0, [IntPtr]::Zero, 3, 0, [IntPtr]::Zero)
if ($h.IsInvalid) {
    $err = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
    [Console]::Error.WriteLine("PRINTER_OPEN_FAILED:$err")
    exit 3
}
$fs = New-Object System.IO.FileStream($h, [System.IO.FileAccess]::Write)
$arr = $buf.ToArray()
$fs.Write($arr, 0, $arr.Length)
$fs.Flush()
Start-Sleep -Milliseconds 400
$fs.Close()
Write-Output "OK:${Com}:$($arr.Length)"
exit 0
