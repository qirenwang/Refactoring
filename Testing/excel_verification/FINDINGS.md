# Fatima's test-data entry vs. database — verification findings (FINAL)

**Date:** 2026-08-04 (supersedes the 2026-08-03 snapshot-only report)
**Excel:** `SweetLab_Microplastics_Bulk_Upload_Template_7_30_26.xlsx` (Fatima Iqbal, 2026-07-30)
**Database:** live `sweetl23_partner_demo`, dump `db/backups/sweetl23_partner_demo_20260804_101538.sql`
**Raw row-by-row output:** `report_20260804_live.txt` — 168 OK / 100 DIFF / 60 NOT_IN_DB / 3 ambiguous Excel rows

---

## ✅ STATUS UPDATE — resolved later the same day (2026-08-04)

All actionable items below were fixed after this report was written:

- **Code fixes** (deploy `public/js/form-handler.js` + `routes/api.js`): hidden-section
  capture bug (§3.1), zero-truthiness drops (§3.2), single sample-amount overwrite (§3.3),
  soil-texture ID/label inconsistency (§3.5).
- **Backfill applied** (`backfill_20260804.js`, 227 statements + `backfill_20260804_fix_smp025.js`):
  the four missing chains of §1 were inserted with all 164 distribution rows, and every
  repairable §2 item was corrected (EVT017 year, missing days, weather/temps, descriptions,
  notes, SMP009 FTIR, sediment fields, SMP019 zeros, separate MP/fragment amounts,
  SMP014/SMP017 totals, zero fragment counts, SMP025 polymer swap).
- **Post-backfill verification** (`report_20260804_post_backfill.txt`, dump
  `sweetl23_partner_demo_20260804_111108.sql`): **242 OK / 0 NOT_IN_DB / 86 DIFF**, where
  every remaining DIFF is either a field with no home in the website/schema (count method 34,
  user sampling IDs 12, location waterbody type 22) or an Excel-side erratum listed in §4
  (times in the notes column, "PVS", the SMP030 row shift, SMP027's 10-vs-60, SMP016's
  impossible "5 × 25% each", SMP020/021 opacity row shift, "Jar test" notes that describe a
  dropdown with no DB column).
- Still open by choice: orphan **Loc#96** (delete manually if agreed) and the §3.4 schema
  gaps (new columns/fields for count method, user sampling ID, DOI/URL), which are feature
  work, not fixes.

---

## 1. Completeness — 26 of 30 sample chains are in the database

**Missing entirely (4):** the location was created but the sampling event + sample were never saved:

| Excel IDs | Media / source | DB location |
|---|---|---|
| EVT015 / SMP015 | Water — river/stream (White River, device installed 2022-01-05→18) | Loc#102 exists, no event |
| EVT020 / SMP020 | Water — Wastewater Effluent/Discharge (Jones Island, 2023-03-14) | Loc#107 exists, no event |
| EVT023 / SMP023 | Aquatic Sediment — river/stream (White River Site 2, 2022-09-06) | Loc#110 exists, no event |
| EVT028 / SMP028 | Aquatic Sediment — Sludge/WWT (Jones Island WRRF, 2017-02-01) | Loc#115 exists, no event |

→ Ask Fatima to re-enter these four samples (or check whether a save error blocked her — see §3.1, all four have media types affected by known bugs).

All 22 locations, both publications, and the other 26 event→sample→results chains exist.

## 2. Correctness of what was entered

**Verified correct:** coordinates, dates (see exceptions), publication links (Lenaker 2019 / Mason 2020, correctly reused), counts, volumes, depths, units, and essentially **all characteristic percentage distributions** — polymer, form, color, size, opacity, texture, purpose — match the Excel. Cases that looked wrong but are actually fine:

- 05A "PVS 9%" (SMP019) → DB has **PVC 9%** (Excel typo; DB consistent).
- 06A SMP024's blank-purpose 75% row → DB shows it was **multi-use, 75%**.
- 05B SMP030's misaligned rows → DB has **Fiber 96 / Pellet 4** (internally consistent).
- SMP017's "25 (should be 20 or 25)" count → DB has **20**.
- SMP031 fragments: stored properly split as 80 purpose-known + 20 purpose-unknown.
- 0%-filled polymer grid rows (SMP016/018) are harmless noise.

**Genuine data discrepancies (data-entry level):**

1. **EVT017 year: DB 2025-02-13 vs Excel 2022-02-13** (month/day match — year typo on entry).
2. **SMP025 polymer swap: DB LDPE 10 / HDPE 12, Excel LDPE 12 / HDPE 10.**
3. **SMP027 size: DB 20-100µm = 60%, Excel says 10%** (DB sums to 100, Excel sums to 50 — Excel is wrong/incomplete).
4. **SMP014 total sample amount: DB 2 L vs Excel 20 L** (typo, or the single-amount fallback grabbed the fragments amount — see §3.3).
5. **SMP017 total sample amount (0.5 L) not stored at all.**
6. **Weather/air-temp not entered for EVT016, EVT017, EVT025** (Excel documents 23 °C Raining +2.5 cm; 25 °C Cloudy; 10 °C Sunny). Other events' weather saved fine, so these were skipped during entry.
7. **Day-of-month left blank for EVT018, EVT021, EVT027** (DB has year+month only; Excel has the 1st).
8. **Sampling-event descriptions and SMP011–013 notes not entered anywhere** (all 12 literature events + notes columns; the site's Sample Description box was left empty).
9. **Orphan location Loc#96 "Lake Erie Site 1" with longitude +83.05** (minus sign lost; superseded 2 min later by correct Loc#97; no events attached) → delete it.
10. Excel `0` values consistently stored as NULL (fragment counts of 0; SMP019's all-zero water metrics) — partly entry habit, partly the truthiness bug in §3.2.

## 3. Website/backend bugs & gaps this test exposed (fix before real data entry)

1. **Aquatic Sediment measurements are silently lost.** All four sediment samples (SMP024/25/26/29) have NULL SamplingDepth, SoilDryWeight, SoilOrganicMatter, SoilTexture, while the identical Terrestrial Soil fields saved fine (SMP030). The sediment inputs exist on formpage4 but never reach the POST payload; note the duplicate `name="soil_texture"` selects in the sediment and soil sections. *(Flagged as a separate fix task.)*
2. **Zero values are dropped by truthiness checks** — `routes/api.js` uses `value ? parseFloat(value) : null` for water metrics, temps, rainfall, so an entered `0` becomes NULL (SMP019's 0-depth/0-velocity/0-DO all lost).
3. **Single sample-amount design:** `total_sample_amount` is copied into the microplastics/fragments/packaging amount columns with one shared unit (api.js ~1897–1916); the separate MP/fragment amounts documented in the Excel (e.g. SMP021 2 g, SMP025 3 g, SMP027 2 g/3 g, SMP031 10 g) are all overwritten by the total.
4. **No form field / column for:** count method (Magnified_Count etc. — `Method_Count_Num` can never be filled), user sampling IDs (OUH-AW-0, GL12#14…), publication DOI/URL/is-published, and `Location.LocationType_Environment` (waterbody type per location; only per-sample MediaSubType captures it — and it's NULL for land-surface samples by design).
5. **SoilTexture stored inconsistently** — terrestrial soil saves the ref ID as text ('6') rather than the label.
6. **Precision:** AirTemp_C and Rainfall_cm are DECIMAL(10,0) (2.5 cm → 3); depths DECIMAL(10,2) (7.3152 → 7.32).

## 4. Excel workbook fixes for Fatima

- 05A SMP019: PVS → **PVC**; 05B SMP030: percentages shifted one row (Fiber 96, Pellet 4); 06A SMP024: 75% row lacks its purpose label (**multi-use** per DB); 05D SMP027: 20-100µm should be **60** (10 doesn't total 100).
- 06E: the "SMP021 Transparent_Clear 15" row — SMP021 has no fragments record; it likely belongs with SMP020's 85%.
- 03: EVT029's date cell shows 1905-07-14 (the number 2022 typed into a date cell — DB correctly has year-only 2022); EVT015/016/018/023 have times sitting in the additional_notes column (DB SampleTime confirms they were meant as sample times); EVT014's date cell holds text "2016" (DB: year-only 2016 ✓).
- 04 SMP017: resolve the "(should be 20 or 25)" note — DB has 20.

## 5. Unrelated cleanup

`Publications` rows 1–15 (Mason 2016) and 18–27 (Cox 2021) are duplicate copies from June/mid-July sessions predating the publication-reuse fix; deduplicate when convenient.

## 6. Re-running

```bash
node scripts/backup-database.js
python3 Testing/excel_verification/verify.py db/backups/<fresh dump>.sql
```
(Python needs `openpyxl`. Requires this machine's IP in cPanel Remote MySQL — VPN off, or re-whitelist after IP changes.)
