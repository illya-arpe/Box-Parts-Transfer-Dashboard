$ErrorActionPreference = "Continue"
$urls = @(
  "https://api.allorigins.org/raw?url=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2F1H4Dyg4ZAf4kJ3C-MEInm4zAT9XyQRDfCl4KgIWkywyM%2Fexport%3Fformat%3Dcsv",
  "https://corsproxy.io/?https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2F1H4Dyg4ZAf4kJ3C-MEInm4zAT9XyQRDfCl4KgIWkywyM%2Fexport%3Fformat%3Dcsv",
  "https://api.allorigins.win/raw?url=https%3A%2F%2Fdocs.google.com%2Fspreadsheets%2Fd%2F1H4Dyg4ZAf4kJ3C-MEInm4zAT9XyQRDfCl4KgIWkywyM%2Fexport%3Fformat%3Dcsv"
)
foreach ($u in $urls) {
  try {
    $r = Invoke-WebRequest -Uri $u -TimeoutSec 12 -UseBasicParsing
    Write-Host ("OK " + $u.Substring(0,40) + " -> " + $r.StatusCode + " len=" + $r.Content.Length)
  } catch {
    Write-Host ("FAIL " + $u.Substring(0,40) + " -> " + $_.Exception.Message)
  }
}
