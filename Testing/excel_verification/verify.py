#!/usr/bin/env python3
"""Verify Fatima's SweetLab bulk-upload Excel against a database dump.

Usage: python verify.py <backup.sql> [--excel <path>]
Produces a row-by-row comparison report on stdout.
"""
import sys
import re
import datetime
from dbdump import load_dump

EXCEL = '/Users/wqr/Desktop/SweetLab_Microplastics_Bulk_Upload_Template_7_30_26.xlsx'
FATIMA_USER_ID = 6
EXAMPLE_IDS = {'LOC001', 'PUB001', 'EVT001', 'SMP001'}  # template example rows, not Fatima's data


def norm(s):
    """Normalize free text for loose comparison."""
    if s is None:
        return ''
    return re.sub(r'[^a-z0-9]+', '', str(s).lower())


def clean(s):
    if s is None:
        return None
    s = str(s).strip()
    return s if s != '' else None


def fnum(v):
    if v is None or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- Excel side
def load_excel(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, data_only=True)
    sheets = {}
    for ws in wb.worksheets:
        rows = [[c for c in r] for r in ws.iter_rows(values_only=True)]
        # find header row: first row whose first cell ends with '*' or known key
        hdr_i = None
        for i, r in enumerate(rows[:6]):
            c0 = str(r[0] or '')
            if (any(str(c or '').strip().endswith('*') for c in r)
                    or c0 in ('sample_upload_id', 'sheet_name', 'publication_upload_id')):
                hdr_i = i
                break
        if hdr_i is None:
            continue
        headers = [str(h).strip().rstrip('*').strip() if h else f'col{j}'
                   for j, h in enumerate(rows[hdr_i])]
        recs = []
        for r in rows[hdr_i + 1:]:
            if all(v is None or str(v).strip() == '' for v in r):
                continue
            recs.append(dict(zip(headers, r)))
        sheets[ws.title] = recs
    return sheets


def date_parts(v):
    """Excel sampling date cell -> (year, month, day, note)."""
    if v is None or str(v).strip() == '':
        return (None, None, None, None)
    if isinstance(v, datetime.datetime) or isinstance(v, datetime.date):
        if v.year < 1950:  # year typed into a date cell -> serialized (e.g. 2022 -> 1905-07-14)
            serial = (datetime.date(v.year, v.month, v.day) - datetime.date(1899, 12, 30)).days
            return (serial, None, None,
                    f'Excel cell shows {v.date() if isinstance(v, datetime.datetime) else v} '
                    f'= serial {serial}; treated as year-only {serial}')
        return (v.year, v.month, v.day, None)
    s = str(v).strip()
    if re.fullmatch(r'\d{4}', s):
        return (int(s), None, None, None)
    m = re.match(r'(\d{4})-(\d{2})-(\d{2})', s)
    if m:
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), None)
    return (None, None, None, f'unparseable date {s!r}')


def time_str(v):
    if v is None:
        return None
    if isinstance(v, datetime.time):
        return v.strftime('%H:%M:%S')
    if isinstance(v, datetime.datetime):
        return v.strftime('%H:%M:%S')
    s = str(v).strip()
    if re.fullmatch(r'\d{1,2}:\d{2}', s):
        return s + ':00'
    return s or None


# --------------------------------------------------- characteristic catalogs
POLYMERS = ['PETE', 'HDPE', 'PVC', 'LDPE', 'PP', 'PS', 'PA', 'PC', 'PLA', 'ABS', 'EVA', 'PB',
            'PE_UHMW', 'PMMA', 'HIPS', 'EPS', 'PAN', 'Rubber', 'Bitumen', 'Other']
MP_FORMS = ['Fiber', 'Pellet', 'Fragment', 'Other_Mixed']
TEXTURES = ['Film', 'Foam', 'HardPlastic', 'Fabric', 'Other_Mixed']
COLORS = ['clear', 'opaque_light', 'opaque_dark', 'mixed', 'black', 'blue', 'green', 'pink',
          'purple', 'red', 'white', 'yellow', 'other_mixed']
SIZES = ['lt_1um', '1_20um', '20_100um', '100um_1mm', '1_5mm']
OPACITIES = ['Transparent_Clear', 'Translucent_Cloudy', 'Opaque_Dark', 'Other_Mixed']
PURPOSES = ['single_use', 'multi_use', 'consumer_product', 'bag_container', 'packing',
            'other_purpose', 'unknown_purpose']

CODE_ALIASES = {
    # colors
    'opaquelight': 'opaque_light', 'opaquedark': 'opaque_dark',
    'othermixed': 'other_mixed', 'otherormixed': 'other_mixed',
    'otherormixedcolors': 'other_mixed',
    # opacity
    'transparentclear': 'Transparent_Clear',
    'transluscnetorcloudy': 'Translucent_Cloudy', 'transclucentorcloudy': 'Translucent_Cloudy',
    'translucentorcloudy': 'Translucent_Cloudy', 'translucentcloudy': 'Translucent_Cloudy',
    'opaqueordark': 'Opaque_Dark', 'otherormixedopacities': 'Other_Mixed',
    # sizes
    'lt1um': 'lt_1um', '1um': 'lt_1um', '120um': '1_20um', '20100um': '20_100um',
    '100um1mm': '100um_1mm', '15mm': '1_5mm',
    # forms/textures
    'fiber': 'Fiber', 'pellet': 'Pellet', 'fragment': 'Fragment', 'film': 'Film',
    'foam': 'Foam', 'hardplastic': 'HardPlastic', 'fabric': 'Fabric',
    # polymers (normalized)
    'rubbersyntheticrubber': 'Rubber', 'peuhmw': 'PE_UHMW',
    # purposes
    'productsforconsumingfoodbeveragesonetime': 'single_use',
    'productesforconsumingorstoringfoosbeveragesmultipletimes': 'multi_use',
    'productsforconsumingorstoringfoodbeveragesmultipletimes': 'multi_use',
    'otherdurablegoodsforlongertermuse': 'consumer_product',
    'bagforcarryingorcontainingitems': 'bag_container',
    'packingorwrappingmaterials': 'packing',
    'unknownpurpose': 'unknown_purpose',
    'singleuse': 'single_use',
}


def canon_code(raw, catalog):
    """Map a raw Excel code to a catalog code; None if unresolvable."""
    if raw is None:
        return None
    s = str(raw).strip()
    for c in catalog:
        if s.lower() == c.lower():
            return c
    n = norm(s)
    if n in CODE_ALIASES and CODE_ALIASES[n] in catalog:
        return CODE_ALIASES[n]
    for c in catalog:
        if n == norm(c):
            return c
    if catalog is COLORS and n in [norm(c) for c in COLORS]:
        return next(c for c in COLORS if norm(c) == n)
    if catalog is PURPOSES and n == 'other':
        return 'other_purpose'
    if n == 'other' and 'Other_Mixed' in catalog:
        return 'Other_Mixed'
    return None


SPLIT_RE = re.compile(r'\s*(?:,|\band\b|&)\s*', re.I)


def expand_dist_rows(rows, catalog, id_field, code_field, pct_field):
    """Expand distribution sheet rows into {sample: [(code, pct, note)]}, flagging problems."""
    out = {}
    problems = []
    pending_other = {}  # sid -> (pct, note): 'all other X are N%' applied after all rows are read
    for r in rows:
        sid = clean(r.get(id_field))
        raw_code = clean(r.get(code_field))
        pct_raw = r.get(pct_field)
        notes = clean(r.get('notes') or r.get('Notes'))
        if sid is None and raw_code is None:
            problems.append(('?', f'stray row with pct={pct_raw!r} (no sample id/code)'))
            continue
        if sid in EXAMPLE_IDS:
            continue
        lst = out.setdefault(sid, [])
        # percentage may carry text like '25% each'
        pct = fnum(pct_raw)
        pct_note = None
        if pct is None and pct_raw is not None:
            m = re.search(r'([\d.]+)', str(pct_raw))
            if m:
                pct = float(m.group(1))
                pct_note = f'pct cell was {pct_raw!r}'
        if raw_code is None:
            problems.append((sid, f'row with blank code, pct={pct_raw!r}'))
            continue
        if raw_code.strip().lower() == 'all':
            if pct is None and notes:
                m = re.search(r'([\d.]+)\s*%', notes)
                if m:
                    pct = float(m.group(1))
                    pct_note = f'pct taken from note {notes!r}'
            if pct is None:
                problems.append((sid, f"'All' row without a numeric pct ({pct_raw!r}, notes={notes!r})"))
                continue
            for c in catalog:
                lst.append((c, pct, "expanded from 'All'"))
            continue
        parts = [p for p in SPLIT_RE.split(raw_code) if p and p.strip()]
        codes = []
        bad = []
        for p in parts:
            c = canon_code(p, catalog)
            (codes if c else bad).append(c or p)
        if bad:
            problems.append((sid, f'unrecognized code(s) {bad} in {raw_code!r}'))
        for c in codes:
            lst.append((c, pct, pct_note))
        # notes like 'All other polymer types contain 1%' / 'are 7.8 %' / 'are 2.5'
        if notes:
            m = re.search(r'all other \D*?([\d.]+)\s*%?', notes, re.I)
            if m:
                pending_other[sid] = (float(m.group(1)), notes)
    for sid, (other_pct, notes) in pending_other.items():
        lst = out.setdefault(sid, [])
        present = {c for c, _, _ in lst}
        for c in catalog:
            if c not in present:
                lst.append((c, other_pct, f'expanded from note {notes!r}'))
    return out, problems


# ---------------------------------------------------------------- DB side
def build_db(t):
    db = {}
    db['loc_by_id'] = {l['Loc_UniqueID']: l for l in t['Location']}
    db['pub_by_id'] = {p['PublicationUniqueID']: p for p in t['Publications']}
    db['events'] = t['SamplingEvent']
    db['samples'] = t['SampleDetails']
    db['micro'] = {m['SampleDetails_Num']: m for m in t['MicroplasticsInSample']}
    db['frag'] = {f['SampleDetails_Num']: f for f in t['FragmentsInSample']}
    for key, tbl, parent in [
        ('mp_poly', 'MicroplasticsPolymerDetails', 'MicroInSample_Num'),
        ('mp_form', 'MicroplasticsFormDetails', 'MicroInSample_Num'),
        ('mp_color', 'MicroplasticsColorDetails', 'MicroInSample_Num'),
        ('mp_size', 'MicroplasticsSizeDetails', 'MicroInSample_Num'),
        ('mp_opac', 'MicroplasticsOpacityDetails', 'MicroInSample_Num'),
        ('fr_poly', 'FragmentsPolymerDetails', 'FragInSample_Num'),
        ('fr_form', 'FragmentsFormDetails', 'FragInSample_Num'),
        ('fr_color', 'FragmentsColorDetails', 'FragInSample_Num'),
        ('fr_opac', 'FragmentsOpacityDetails', 'FragInSample_Num'),
        ('fr_purp', 'FragmentsPurposes', 'FragInSample_Num'),
    ]:
        g = {}
        for r in t.get(tbl, []):
            g.setdefault(r[parent], []).append(r)
        db[key] = g
    # ref id -> canonical code
    db['ref'] = {
        'polymer': {r['PolymerUniqueID']: r['Polymer_Code'].strip() for r in t['PolymerType_Ref']},
        'form': {r['FormUniqueID']: r['Form_Name'].strip() for r in t['Form_Ref']},
        'color': {r['ColorUniqueID']: r['Color_Code'].strip() for r in t['ColorType_Ref']},
        'size': {r['SizeUniqueID']: r['Size_Code'].strip() for r in t['SizeClass_Ref']},
        'opacity': {r['OpacityUniqueID']: r['Opacity_Code'].strip() for r in t['Opacity_Ref']},
        'purpose': {r['PurposeUniqueID']: r['Purpose_Code'].strip() for r in t['Purpose_Ref']},
        'weather': {r['WeatherUniqueID']: r['WeatherType'].strip() for r in t['WeatherType_Ref']},
        'method': {r['MethodsUniqueID']: r['Method_Code'].strip() for r in t['Methods_Ref']},
        'unit': {r['UnitsUniqueID']: r['Units_Code'].strip() for r in t['Units_Ref']},
        'pubsource': {r['PubSourceUniqueID']: r['PubSourceLabel'].strip() for r in t['PubSource_Ref']},
        'soiltexture': {r['SoilTextureUniqueID']: str(r['SoilTexture_Code']).strip() for r in t['SoilTexture_Ref']},
    }
    return db


METHOD_CODE_BY_NAME = {'recyclecode': 'Recycle_Code', 'raman': 'Raman', 'ramanspectroscopy': 'Raman',
                       'ir': 'IR', 'ftir': 'FTIR', 'optir': 'O-PTIR', 'magnifiedcount': 'Magnified_Count',
                       'unmagnifiedcount': 'Unmagnified_Count', 'othercount': 'Other_Count'}


class Report:
    def __init__(self):
        self.lines = []
        self.counts = {}

    def add(self, entity, ident, status, detail=''):
        self.counts[status] = self.counts.get(status, 0) + 1
        self.lines.append((entity, ident, status, detail))

    def dump(self):
        w = max((len(f'{e} {i}') for e, i, _, _ in self.lines), default=10)
        cur = None
        for e, i, s, d in self.lines:
            if e != cur:
                print(f'\n----- {e} -----')
                cur = e
            print(f'{(e + " " + i).ljust(w)}  {s}{"  " + d if d else ""}')
        print('\n===== SUMMARY =====')
        for k in sorted(self.counts):
            print(f'{k}: {self.counts[k]}')


def diff_field(diffs, label, expected, actual, tol=None):
    if expected is None and actual is None:
        return
    if tol is not None:
        e, a = fnum(expected), fnum(actual)
        if e is None and a is None:
            return
        if e is not None and a is not None and abs(e - a) <= tol:
            return
    else:
        if expected == actual:
            return
        if norm(expected) == norm(actual) and norm(expected) != '':
            return
    diffs.append(f'{label}: excel={expected!r} db={actual!r}')


def main():
    dump_path = sys.argv[1]
    excel_path = EXCEL
    if '--excel' in sys.argv:
        excel_path = sys.argv[sys.argv.index('--excel') + 1]

    xl = load_excel(excel_path)
    t = load_dump(dump_path)
    db = build_db(t)
    rep = Report()

    # ---------------- Locations ----------------
    loc_map = {}   # LOCxxx -> Loc_UniqueID
    db_loc_by_name = {}
    for lid, l in db['loc_by_id'].items():
        db_loc_by_name.setdefault(norm(l['LocationName']), []).append(l)

    for r in xl['01_Locations']:
        up = clean(r.get('loc_upload_id'))
        if not up or up in EXAMPLE_IDS:
            continue
        name = clean(r.get('location_name'))
        cands = db_loc_by_name.get(norm(name), [])
        cands = [c for c in cands if c['UserCreated'] == FATIMA_USER_ID] or cands
        unused = [c for c in cands if c['Loc_UniqueID'] not in loc_map.values()]
        cands = unused or cands
        if not cands:
            rep.add('Location', f'{up} ({name})', 'NOT_IN_DB')
            continue
        desc_e = norm(clean(r.get('location_description')))
        desc_match = [c for c in cands if norm(c.get('Location_Desc')) == desc_e]
        l = sorted(desc_match or cands, key=lambda c: c['DateCreated'])[-1]
        loc_map[up] = l['Loc_UniqueID']
        diffs = []
        diff_field(diffs, 'description', clean(r.get('location_description')), clean(l.get('Location_Desc')))
        lat, lon = fnum(r.get('latitude')), r.get('longitude')
        # unicode minus in Excel
        if isinstance(lon, str):
            lon = fnum(lon.replace('−', '-'))
        else:
            lon = fnum(lon)
        diff_field(diffs, 'lat', lat, fnum(l.get('Lat_DecimalDegree')), tol=5e-7 + (abs(lat) * 1e-9 if lat else 0))
        diff_field(diffs, 'long', lon, fnum(l.get('Long_DecimalDegree')), tol=5e-7)
        env = clean(r.get('env_indoor_outdoor'))
        if env:
            expected_env = 1 if env == 'outdoor' else 2
            diff_field(diffs, 'env_indoor', expected_env, l.get('Env_Indoor_SelectID'))
        lte = clean(r.get('location_type_environment'))
        if lte and norm(l.get('LocationType_Environment')) != norm(lte):
            diffs.append(f'location_type_environment: excel={lte!r} db={l.get("LocationType_Environment")!r}')
        rep.add('Location', f'{up} ({name})', 'DIFF' if diffs else 'OK',
                f'-> Loc#{l["Loc_UniqueID"]}' + ('; ' + '; '.join(diffs) if diffs else ''))

    # DB-side extra locations by Fatima since 2026-07-22 not matched by Excel
    matched_ids = set(loc_map.values())
    for lid, l in sorted(db['loc_by_id'].items()):
        if l['UserCreated'] == FATIMA_USER_ID and str(l['DateCreated']) >= '2026-07-22' and lid not in matched_ids:
            rep.add('Location', f'DB Loc#{lid} ({l["LocationName"]})', 'EXTRA_IN_DB',
                    f'lat={l.get("Lat_DecimalDegree")} long={l.get("Long_DecimalDegree")} created={l["DateCreated"]}')

    # ---------------- Publications ----------------
    pub_map = {}
    for r in xl['02_Publications']:
        up = clean(r.get('publication_upload_id'))
        if not up or up in EXAMPLE_IDS:
            continue
        authors = clean(r.get('authors'))
        year = fnum(r.get('year'))
        first_tok = norm(authors.split(',')[0]) if authors else ''
        cands = [p for p in db['pub_by_id'].values()
                 if fnum(p.get('Year')) == year and norm(str(p.get('Authors'))).startswith(first_tok[:12])]
        if not cands:
            rep.add('Publication', up, 'NOT_IN_DB', f'{authors[:40]}... ({year})')
            continue
        p = sorted(cands, key=lambda c: c['PublicationUniqueID'])[-1]
        pub_map[up] = p['PublicationUniqueID']
        diffs = []
        diff_field(diffs, 'journal', clean(r.get('journal')), clean(p.get('Journal')))
        cit_e, cit_d = norm(r.get('full_citation_apa')), norm(p.get('FullCitation_APA'))
        if cit_e[:60] != cit_d[:60]:
            diffs.append('full_citation differs')
        src = clean(r.get('publication_source'))
        db_src = db['ref']['pubsource'].get(p.get('PubSource_Code'))
        diff_field(diffs, 'source', src, db_src)
        note = f'-> Pub#{p["PublicationUniqueID"]}'
        if clean(r.get('doi')) or clean(r.get('url')):
            note += ' [doi/url not storable: no DB columns]'
        if len(cands) > 1:
            note += f' [{len(cands)} duplicate rows in DB: {[c["PublicationUniqueID"] for c in cands]}]'
        rep.add('Publication', up, 'DIFF' if diffs else 'OK', note + ('; ' + '; '.join(diffs) if diffs else ''))

    # ---------------- Events + Samples (matched as a chain) ----------------
    samples_by_event = {}
    for s in db['samples']:
        samples_by_event.setdefault(s['SamplingEvent_Num'], []).append(s)

    ev_rows = {clean(r.get('event_upload_id')): r for r in xl['03_Sampling_Events']
               if clean(r.get('event_upload_id')) and clean(r.get('event_upload_id')) not in EXAMPLE_IDS}
    smp_rows = {clean(r.get('sample_upload_id')): r for r in xl['04_Sample_Details']
                if clean(r.get('sample_upload_id')) and clean(r.get('sample_upload_id')) not in EXAMPLE_IDS}
    smp_by_event = {clean(r.get('event_upload_id')): sid for sid, r in smp_rows.items()}

    used_event_ids = set()
    event_map, sample_map = {}, {}

    for eid in sorted(ev_rows):
        r = ev_rows[eid]
        loc_up = clean(r.get('loc_upload_id'))
        loc_id = loc_map.get(loc_up)
        ident = f'{eid} (loc {loc_up})'
        if loc_id is None:
            rep.add('SamplingEvent', ident, 'NOT_IN_DB', 'location missing, so event cannot exist')
            continue
        y, m, d, dnote = date_parts(r.get('sampling_date'))
        if y is None and clean(r.get('device_start_date')) is not None:
            y, m, d, _ = date_parts(r.get('device_start_date'))
            dnote = dnote or 'start date taken from device_start_date (no sampling_date)'
        cands_loc = [e for e in db['events']
                     if e['LocationID_Num'] == loc_id and e['UserSamplingID'] == FATIMA_USER_ID
                     and e['SamplingEventUniqueID'] not in used_event_ids]
        cands = [e for e in cands_loc
                 if e.get('StartYear') == y and e.get('StartMonth') == m and e.get('StartDay') == d]
        date_diff = None
        if not cands and len(cands_loc) == 1 and sum(
                1 for rr in ev_rows.values() if clean(rr.get('loc_upload_id')) == loc_up) == 1:
            # single unmatched event at this location: pair it and report the date difference
            e0 = cands_loc[0]
            got = (e0.get('StartYear'), e0.get('StartMonth'), e0.get('StartDay'))
            date_diff = f'sampling_date: excel={y}-{m}-{d} db={got[0]}-{got[1]}-{got[2]}'
            if (got[0], got[1]) == (y, m) and got[2] is None and d is not None:
                date_diff = f'sampling_date day not entered: excel={y}-{m}-{d} db={got[0]}-{got[1]}-(no day)'
            elif (got[1], got[2]) == (m, d) and got[0] != y:
                date_diff = f'sampling_date YEAR mismatch: excel={y} db={got[0]} (month/day match)'
            cands = [e0]
        # disambiguate same-date events via the linked sample's volume / depth / count
        smp_id = smp_by_event.get(eid)
        srow = smp_rows.get(smp_id, {}) if smp_id else {}
        if len(cands) > 1 and srow:
            def skey(e):
                ss = samples_by_event.get(e['SamplingEventUniqueID'], [])
                if not ss:
                    return None
                s0 = ss[0]
                return (fnum(s0.get('VolumeSampled')), fnum(s0.get('SampleWaterDepth')),
                        s0.get('Micro5mmAndSmaller_Count'))
            want_vol = fnum(srow.get('volume_sampled'))
            want_dep = fnum(srow.get('sample_water_depth_m'))
            want_cnt = fnum(srow.get('microplastics_5mm_and_smaller_count'))
            best = [e for e in cands if skey(e) and
                    (want_vol is None or abs((skey(e)[0] or -1) - want_vol) < 0.5) and
                    (want_dep is None or (skey(e)[1] is not None and abs(skey(e)[1] - want_dep) < 0.05)) and
                    (want_cnt is None or skey(e)[2] == int(want_cnt))]
            if best:
                cands = best[:1]
        if not cands:
            rep.add('SamplingEvent', ident, 'NOT_IN_DB', f'date={y}-{m}-{d}' + (f' [{dnote}]' if dnote else ''))
            continue
        e = cands[0]
        used_event_ids.add(e['SamplingEventUniqueID'])
        event_map[eid] = e['SamplingEventUniqueID']
        diffs, notes = [], []
        if date_diff:
            diffs.append(date_diff)
        if dnote:
            notes.append(dnote)
        pub_up = clean(r.get('publication_upload_id'))
        want_pub = pub_map.get(pub_up) if pub_up else None
        if clean(r.get('publication_present')) == 'yes' and want_pub != e.get('PublicationID_Num'):
            diffs.append(f'publication: excel={pub_up}->{want_pub} db={e.get("PublicationID_Num")}')
        if clean(r.get('publication_present')) is None and e.get('PublicationID_Num') is not None:
            diffs.append(f'publication: excel=none db={e.get("PublicationID_Num")}')
        at = fnum(r.get('air_temp_c'))
        if at is not None:
            diff_field(diffs, 'air_temp', round(at), fnum(e.get('AirTemp_C')), tol=0.01)
        wc = clean(r.get('weather_current'))
        if wc:
            db_w = db['ref']['weather'].get(e.get('Weather_Current'))
            if norm(wc).replace('sunnny', 'sunny') != norm(db_w):
                diffs.append(f'weather_current: excel={wc!r} db={db_w!r}')
        wp = clean(r.get('weather_precedent24'))
        if wp:
            db_w = db['ref']['weather'].get(e.get('Weather_Precedent24')) or db['ref']['weather'].get(e.get('WeatherPrecedent24'))
            if norm(wp) != norm(db_w):
                diffs.append(f'weather_precedent24: excel={wp!r} db={db_w!r}')
        rf = fnum(r.get('rainfall_cm_precedent24'))
        if rf is not None:
            db_rf = fnum(e.get('Rainfall_cm_Precedent24'))
            if db_rf is None or abs(db_rf - round(rf)) > 0.01:
                diffs.append(f'rainfall: excel={rf} db={db_rf} (column rounds to whole cm)')
        dev = clean(r.get('device_installation_period'))
        db_dev = clean(e.get('DeviceInstallationPeriod'))
        exp_dev = dev if dev else ('yes' if clean(r.get('device_start_date')) else None)
        if exp_dev and exp_dev != db_dev:
            diffs.append(f'device_period: excel={exp_dev} db={db_dev}')
        for xf, part in [('device_start_date', 'start'), ('device_end_date', 'end')]:
            dv = r.get(xf)
            if clean(dv) is not None:
                yy, mm, dd, _ = date_parts(dv)
                if part == 'end':
                    got = (e.get('EndYear'), e.get('EndMonth'), e.get('EndDay'))
                    if got != (yy, mm, dd):
                        diffs.append(f'{xf}: excel={yy}-{mm}-{dd} db={got}')
        st = time_str(r.get('sample_time'))
        db_st = clean(e.get('SampleTime'))
        if st and norm(st) != norm(db_st):
            diffs.append(f'sample_time: excel={st!r} db={db_st!r}')
        desc = clean(r.get('sampling_event_description'))
        if desc and norm(desc) != norm(e.get('SamplerNames')):
            diffs.append(f'description: excel={desc[:40]!r}... db(SamplerNames)={clean(e.get("SamplerNames"))!r}')
        usid = clean(r.get('user_sampling_id'))
        if usid:
            found = any(usid in str(e.get(f) or '') for f in ('AdditionalNotes', 'SamplerNames'))
            if not found:
                diffs.append(f'user_sampling_id {usid!r}: not stored anywhere (no DB field)')
        an = clean(r.get('additional_notes'))
        if an:
            db_an = clean(e.get('AdditionalNotes'))
            if norm(an) != norm(db_an):
                extra = ''
                if norm(time_str(an)) == norm(clean(e.get('SampleTime'))):
                    extra = ' (value equals DB SampleTime — likely entered as sample time)'
                diffs.append(f'additional_notes: excel={an!r} db={db_an!r}{extra}')
        rep.add('SamplingEvent', ident, 'DIFF' if diffs else 'OK',
                f'-> Event#{e["SamplingEventUniqueID"]}' +
                ('; ' + '; '.join(diffs) if diffs else '') +
                (' [' + '; '.join(notes) + ']' if notes else ''))

    # ---------------- Sample details ----------------
    MEDIA_MAP = {'water': 1, 'aquaticsediment': 2, 'interrestrialsoil': 2, 'onsoilorlandsurface': 3,
                 'mixedmedia': 4}
    for sid in sorted(smp_rows):
        r = smp_rows[sid]
        eid = clean(r.get('event_upload_id'))
        ident = f'{sid} (evt {eid})'
        ev_db = event_map.get(eid)
        if ev_db is None:
            rep.add('SampleDetails', ident, 'NOT_IN_DB', 'event not in DB')
            continue
        ss = samples_by_event.get(ev_db, [])
        if not ss:
            rep.add('SampleDetails', ident, 'NOT_IN_DB', f'event#{ev_db} has no SampleDetails row')
            continue
        s = ss[0]
        sample_map[sid] = s['SampleUniqueID']
        diffs = []
        mt = clean(r.get('media_type'))
        exp_mt = MEDIA_MAP.get(norm(mt))
        diff_field(diffs, 'media_type', exp_mt, s.get('MediaType_SelectID'))
        mec = clean(r.get('media_environment_code'))
        if mec and norm(mec) not in (norm(s.get('MediaSubType')), ''):
            sub = norm(s.get('MediaSubType'))
            if not (norm(mec) in sub or sub in norm(mec)) or sub == '':
                diffs.append(f'media_env: excel={mec!r} db(MediaSubType)={s.get("MediaSubType")!r}')
        # counts
        frag_e = fnum(r.get('fragments_larger_than_5mm_count'))
        wpkg_e = fnum(r.get('Whole Packaging count'))
        exp_frag = None
        if frag_e is not None or wpkg_e is not None:
            exp_frag = int((frag_e or 0) + (wpkg_e or 0))
        db_frag = s.get('FragLargerThan5mm_Count')
        if exp_frag != db_frag and not (exp_frag == 0 and db_frag is None):
            diffs.append(f'frag>5mm count: excel={exp_frag} db={db_frag}')
        elif exp_frag == 0 and db_frag is None:
            diffs.append('frag>5mm count: excel=0 stored as NULL')
        mc_raw = r.get('microplastics_5mm_and_smaller_count')
        mc = fnum(mc_raw)
        if mc is None and clean(mc_raw):
            m = re.search(r'(\d+)', str(mc_raw))
            if m:
                mc = float(m.group(1))
                diffs.append(f'micro count cell ambiguous in excel: {mc_raw!r}')
        if mc is not None and int(mc) != s.get('Micro5mmAndSmaller_Count'):
            diffs.append(f'micro count: excel={int(mc)} db={s.get("Micro5mmAndSmaller_Count")}')
        for xf, dbf, tol in [('soil_moisture_percent', 'SoilMoisture_Percent', 0.5),
                             ('volume_sampled', 'VolumeSampled', 0.001),
                             ('water_depth_m', 'WaterDepth', 0.005),
                             ('sample_water_depth_m', 'SampleWaterDepth', 0.005),
                             ('flow_velocity_m_s', 'FlowVelocity', 0.005),
                             ('suspended_solids_mg_l', 'SuspendedSolids', 0.005),
                             ('conductivity_us_cm', 'Conductivity', 0.005),
                             ('turbidity_ntu', 'Turbidity', 0.005),
                             ('dissolved_oxygen_mg_l', 'DissolvedOxygen', 0.005),
                             ('sampling_depth_m', 'SamplingDepth', 0.005),
                             ('soil_dry_weight_g', 'SoilDryWeight', 0.005),
                             ('soil_organic_matter_percent', 'SoilOrganicMatter', 0.005),
                             ('soil_sand_percent', 'SoilSand', 0.005),
                             ('soil_silt_percent', 'SoilSilt', 0.005),
                             ('soil_clay_percent', 'SoilClay', 0.005),
                             ('surface_area_sampled_m2', 'SurfaceAreaSampled', 1e-6),
                             ('Area Sampled km2', 'SurfaceAreaSampled', 1e-6),
                             ('Permeable surfaces (%)', 'PermeableSurfaces', 0.005),
                             ('Impermeable surfaces (%)', 'ImpermeableSurfaces', 0.005),
                             ('replicates_count', 'ReplicatesCount', 0.001),
                             ('total_sample_amount', 'TotalSampleAmount', 1e-6)]:
            ev = fnum(r.get(xf))
            if ev is None:
                continue
            av = fnum(s.get(dbf))
            if av is None or abs(ev - av) > max(tol, abs(ev) * 1e-6):
                # allow decimal-scale rounding (2dp)
                if av is not None and abs(round(ev, 2) - av) <= 0.005:
                    diffs.append(f'{xf}: excel={ev} db={av} (rounded by column precision)')
                else:
                    diffs.append(f'{xf}: excel={ev} db={av}')
        st_e = clean(r.get('soil_texture'))
        if st_e:
            db_st = clean(s.get('SoilTexture'))
            if db_st and db_st.isdigit():
                db_st = db['ref']['soiltexture'].get(int(db_st), db_st)
            if norm(st_e).replace('sily', 'silty') != norm(db_st):
                diffs.append(f'soil_texture: excel={st_e!r} db={clean(s.get("SoilTexture"))!r}')
        su = clean(r.get('sample_unit'))
        if su:
            db_su = db['ref']['unit'].get(s.get('SampleUnit_Num'))
            diff_field(diffs, 'sample_unit', su, db_su)
        # separate MP / fragment amounts (backend stores total in all columns)
        for xf, dbf, uf, duf in [('microplastics_sample_amount', 'MicroplasticsSampleAmount',
                                  'microplastics_sample_unit', 'MicroplasticsSampleUnit_Num'),
                                 ('fragments_sample_amount', 'FragmentsSampleAmount',
                                  'fragments_sample_unit', 'FragmentsSampleUnit_Num')]:
            ev = fnum(r.get(xf))
            if ev is None:
                continue
            av = fnum(s.get(dbf))
            if av is None or abs(ev - av) > 1e-6:
                diffs.append(f'{xf}: excel={ev}{clean(r.get(uf)) or ""} db={av} '
                             f'(backend copies total_sample_amount into this column)')
        notes_e = clean(r.get('notes'))
        if notes_e and norm(notes_e) != norm(s.get('MediaAdditionalNotes')):
            diffs.append(f'notes: excel={notes_e[:40]!r} db(MediaAdditionalNotes)={clean(s.get("MediaAdditionalNotes"))!r}')
        rep.add('SampleDetails', ident, 'DIFF' if diffs else 'OK',
                f'-> Sample#{s["SampleUniqueID"]}' + ('; ' + '; '.join(diffs) if diffs else ''))

    # ---------------- MP / Fragment summaries ----------------
    def check_summary(sheet, kind):
        rows = xl[sheet]
        for r in rows:
            sid = clean(r.get('sample_upload_id'))
            if not sid or sid in EXAMPLE_IDS:
                continue
            db_sid = sample_map.get(sid)
            ident = sid
            if db_sid is None:
                rep.add(kind, ident, 'NOT_IN_DB', 'sample not in DB')
                continue
            rec = (db['micro'] if kind == 'MP_Results' else db['frag']).get(db_sid)
            if rec is None:
                rep.add(kind, ident, 'NOT_IN_DB', f'sample#{db_sid} has no {kind} row')
                continue
            diffs = []
            tq_raw = r.get('total_quantity')
            tq = fnum(tq_raw)
            if tq is None and clean(tq_raw):
                m = re.search(r'(\d+)', str(tq_raw))
                if m:
                    tq = float(m.group(1))
                    diffs.append(f'total_quantity cell ambiguous: {tq_raw!r}')
            db_tq = rec.get('Micro5mmAndSmaller_Count') if kind == 'MP_Results' else \
                ((rec.get('PurposeKnown_Count') or 0) + (rec.get('PurposeUnknown_Count') or 0)
                 if rec.get('PurposeKnown_Count') is not None or rec.get('PurposeUnknown_Count') is not None else None)
            if tq is not None and (db_tq is None or int(tq) != db_tq):
                if kind == 'Frag_Results' and rec.get('PurposeUnknown_Count') == int(tq):
                    pass  # excel total counts fragments only; packaging tracked in PurposeKnown_Count
                else:
                    diffs.append(f'total_quantity: excel={tq} db={db_tq}')
            tm = fnum(r.get('total_mass'))
            db_tm = fnum(rec.get('Mass_MP_Total') if kind == 'MP_Results' else rec.get('Mass_Debris_Total'))
            if tm is not None and (db_tm is None or abs(tm - db_tm) > 1e-6):
                diffs.append(f'total_mass: excel={tm} db={db_tm}')
            cm = clean(r.get('count_method'))
            if cm:
                db_cm = db['ref']['method'].get(rec.get('Method_Count_Num')) or clean(rec.get('Method_Count_Legacy'))
                if norm(cm) != norm(db_cm):
                    diffs.append(f'count_method: excel={cm!r} db={db_cm!r}')
            pm = clean(r.get('polymer_method')) or clean(r.get('polymer_method_other'))
            if pm:
                db_pm = db['ref']['method'].get(rec.get('Method_Polymer_Num')) or clean(rec.get('Method_Polymer_Other')) or clean(rec.get('Method_Polymer_Legacy'))
                want = METHOD_CODE_BY_NAME.get(norm(pm), pm)
                if norm(want) != norm(db_pm):
                    diffs.append(f'polymer_method: excel={pm!r} db={db_pm!r}')
            rep.add(kind, ident, 'DIFF' if diffs else 'OK', '; '.join(diffs))

    check_summary('05_Microplastics_Results', 'MP_Results')
    check_summary('06_Fragments_Results', 'Frag_Results')

    # ---------------- Distributions ----------------
    def check_dist(sheet, kind, catalog, db_key, parent_of, ref_kind, ref_col, pct_col, legacy_col,
                   code_field='polymer_code', xl_pct_field='percentage', row_filter=None):
        rows = xl.get(sheet, [])
        expected, problems = expand_dist_rows(rows, catalog, 'sample_upload_id', code_field, xl_pct_field)
        for sid, prob in problems:
            rep.add(kind, sid, 'EXCEL_AMBIGUOUS', prob)
        for sid in sorted(set(expected) | set()):
            exp = expected[sid]
            db_sid = sample_map.get(sid)
            if db_sid is None:
                rep.add(kind, sid, 'NOT_IN_DB', f'{len(exp)} expected rows; sample not in DB')
                continue
            parent = parent_of(db_sid)
            drows = db[db_key].get(parent, []) if parent is not None else []
            if row_filter:
                drows = [dr for dr in drows if row_filter(dr)]
            got = {}
            for dr in drows:
                code = db['ref'][ref_kind].get(dr.get(ref_col)) or clean(dr.get(legacy_col))
                got[norm(code)] = fnum(dr.get(pct_col))
            diffs = []
            for code, pct, note in exp:
                k = norm(code)
                if k not in got:
                    diffs.append(f'missing {code} ({pct}%)')
                elif pct is not None and got[k] is not None and abs(got[k] - pct) > 0.01:
                    diffs.append(f'{code}: excel={pct} db={got[k]}')
                got.pop(k, None)
            for k, v in got.items():
                if v == 0:
                    continue  # 0% rows entered in the site's polymer grid are noise, not data
                diffs.append(f'extra in DB: {k}={v}')
            rep.add(kind, sid, 'DIFF' if diffs else 'OK',
                    f'{len(exp)} rows' + ('; ' + '; '.join(diffs) if diffs else ''))

    micro_parent = lambda db_sid: (db['micro'].get(db_sid) or {}).get('Micro_UniqueID')
    frag_parent = lambda db_sid: (db['frag'].get(db_sid) or {}).get('Fragment_UniqueID')

    check_dist('05A_MP_Polymer', 'MP_Polymer', POLYMERS, 'mp_poly', micro_parent,
               'polymer', 'PolymerID_Num', 'Percentage', 'PolymerType_Legacy')
    check_dist('05B_MP_Form', 'MP_Form', MP_FORMS, 'mp_form', micro_parent,
               'form', 'MicroShape_Num', 'MicroShape_Percent', 'MicroShape_Legacy', code_field='form_code',
               row_filter=lambda dr: dr.get('MicroShape_Num') is not None or clean(dr.get('MicroShape_Legacy')))
    check_dist('05C_MP_Color', 'MP_Color', COLORS, 'mp_color', micro_parent,
               'color', 'MicroColor_Num', 'MicroColorPercent', 'MicroColor_Legacy', code_field='color_code')
    check_dist('05D_MP_Size', 'MP_Size', SIZES, 'mp_size', micro_parent,
               'size', 'MicroSize_Num', 'MicroSizePercent', 'MicroSize_Legacy', code_field='size_code')
    check_dist('05E_MP_Opacity', 'MP_Opacity', OPACITIES, 'mp_opac', micro_parent,
               'opacity', 'MicroOpacity_Num', 'MicroOpacityPercent', 'MicroOpacity_Legacy', code_field='opacity_code')

    # MP textures live in MicroplasticsFormDetails texture columns
    tex_rows = xl.get('MP_Textures', [])
    expected, problems = expand_dist_rows(tex_rows, TEXTURES, 'sample_upload_id', 'texture_code', 'percentage')
    for sid, prob in problems:
        rep.add('MP_Texture', sid, 'EXCEL_AMBIGUOUS', prob)
    for sid in sorted(expected):
        exp = expected[sid]
        db_sid = sample_map.get(sid)
        if db_sid is None:
            rep.add('MP_Texture', sid, 'NOT_IN_DB', f'{len(exp)} expected rows; sample not in DB')
            continue
        parent = micro_parent(db_sid)
        drows = db['mp_form'].get(parent, []) if parent is not None else []
        got = {}
        for dr in drows:
            if dr.get('MicroTexture_Num') is None and clean(dr.get('MicroTexture_Legacy')) is None:
                continue
            code = db['ref']['form'].get(dr.get('MicroTexture_Num')) or clean(dr.get('MicroTexture_Legacy'))
            got[norm(code)] = fnum(dr.get('MicroTexture_Percent'))
        diffs = []
        for code, pct, note in exp:
            k = norm(code)
            if k not in got:
                diffs.append(f'missing {code} ({pct}%)')
            elif pct is not None and got[k] is not None and abs(got[k] - pct) > 0.01:
                diffs.append(f'{code}: excel={pct} db={got[k]}')
            got.pop(k, None)
        for k, v in got.items():
            diffs.append(f'extra in DB: {k}={v}')
        rep.add('MP_Texture', sid, 'DIFF' if diffs else 'OK',
                f'{len(exp)} rows' + ('; ' + '; '.join(diffs) if diffs else ''))

    check_dist('06A_Fragment_Purpose', 'Frag_Purpose', PURPOSES, 'fr_purp', frag_parent,
               'purpose', 'Purpose_Num', 'Percent_Purpose', 'Purpose_Legacy', code_field='purpose_code',
               xl_pct_field='quantity')
    check_dist('06B_Fragment_Polymer', 'Frag_Polymer', POLYMERS, 'fr_poly', frag_parent,
               'polymer', 'PolymerID_Num', 'Percentage', 'PolymerType_Legacy')
    check_dist('06C_Fragment_Texture', 'Frag_Texture', TEXTURES, 'fr_form', frag_parent,
               'form', 'FragForm_Num', 'FragFormPercent', 'FragForm_Legacy', code_field='form_code')
    check_dist('06D_Fragment_Color', 'Frag_Color', COLORS, 'fr_color', frag_parent,
               'color', 'FragColor_Num', 'FragColorPercent', 'FragColor_Legacy', code_field='color_code')
    check_dist('06E_Fragment_Opacity', 'Frag_Opacity', OPACITIES, 'fr_opac', frag_parent,
               'opacity', 'FragOpacity_Num', 'FragOpacityPercent', 'FragOpacity_Legacy', code_field='opacity_code')

    # 06A purpose quantities: Excel 'quantity' column actually holds percentages; flag rows where they
    # could be quantities (sum != 100) is handled by EXCEL_AMBIGUOUS/diffs above.

    rep.dump()


if __name__ == '__main__':
    main()
