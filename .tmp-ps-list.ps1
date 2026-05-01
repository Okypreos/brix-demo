Get-Process node -ErrorAction SilentlyContinue |
  Select-Object Id, @{n='MemMB';e={[math]::Round($_.WorkingSet64/1MB,1)}}, StartTime |
  Sort-Object StartTime |
  Format-Table -AutoSize
