# Fatima bulk-upload Excel — database verification toolkit

Checks every row of `SweetLab_Microplastics_Bulk_Upload_Template_7_30_26.xlsx`
(Fatima's test-data workbook, 2026-07-30) against a database backup dump and
reports, per entity, `OK` / `DIFF` / `NOT_IN_DB` / `EXTRA_IN_DB` / `EXCEL_AMBIGUOUS`.

## Files

- `verify.py` — the checker. Parses the Excel (locations, publications, events,
  sample details, MP/fragment summaries, and all characteristic-distribution
  sheets, expanding compound rows like `"PETE, PP and LDPE | 25% each"` and
  `"All | 5"`), parses a SQL dump produced by `scripts/backup-database.js`,
  matches Fatima's chains (Location → SamplingEvent → SampleDetails →
  Microplastics/Fragments → detail tables), and diffs field by field.
- `dbdump.py` — parser for the backup dump format.
- `FINDINGS.md` — the authoritative findings write-up (2026-08-04, full live-DB check,
  with the same-day resolution status at the top).
- `report_20260804_live.txt` — pre-fix results (168 OK / 100 DIFF / 60 NOT_IN_DB).
- `report_20260804_post_backfill.txt` — final state after code fixes + backfill:
  **242 OK / 0 NOT_IN_DB / 86 DIFF** (all remaining DIFFs are no-destination fields
  or Excel-side errata; see FINDINGS.md).
- `backfill_20260804.js`, `backfill_20260804_fix_smp025.js`,
  `backfill_distributions.json` — the applied one-shot backfill (guarded against
  double-running; kept for audit).

## Re-running against fresh data

1. In cPanel → Remote MySQL, whitelist the current IP of the machine running
   the tool (the connection error names it; residential IPs rotate).
2. Take a fresh backup: `node scripts/backup-database.js`
3. Run:

```bash
python3 Testing/excel_verification/verify.py db/backups/<fresh-dump>.sql
```

Needs Python 3 with `openpyxl` (`pip install openpyxl`). If the Excel moved,
pass `--excel /path/to/workbook.xlsx`.

## Reading the report

- `DIFF` lines show `field: excel=… db=…`. Systematic ones (count_method,
  user_sampling_id, doi/url) reflect missing website fields/columns, not
  data-entry mistakes — see the findings report from 2026-08-03.
- `Fatima = users.User_UniqueID 6`; the tool only matches her rows.
- Template example rows (LOC001/PUB001/EVT001/SMP001) are skipped by design.
