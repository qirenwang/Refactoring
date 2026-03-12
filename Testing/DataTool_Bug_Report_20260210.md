# Data Tool Bug Report — Tester: Fatima (2026-02-10)

## Context

Fatima tested the Microplastics Data Entry System with two complete test cases (see `DataTool_Test.pdf`) and one additional media type. She identified 3 bugs and 1 feature request.

---

## Bug #1: "On Soil or Land Surface" — Continue Button Disabled

**Severity:** High (blocks data submission entirely for this media type)

**Steps to Reproduce:**
1. Select media type: **"On Soil or Land Surface"**
2. In the "Additional Sampling Information" section, select **"Yes"**
3. Fill in all fields:
   - Area sampled (km²): 10
   - Permeable surfaces (%): 85
   - Impermeable surfaces (%): 15
4. Observe the **Continue** button at the bottom

**Expected Behavior:** The Continue button should be enabled and clickable, allowing the user to proceed to the Sample Details page.

**Actual Behavior:** The Continue button remains **disabled/grayed out**. The user cannot save the data or proceed to the next step.

**Evidence:** See uploaded screenshot `Test.png` — shows the form fully filled out with Continue button disabled.

**Notes:** This issue makes the entire "On Soil or Land Surface" media type unusable. Other media types (In Water, In Aquatic Sediment) work correctly with the same flow. Likely a form validation issue specific to this media type — check if there's a missing or incorrect validation rule on the soil/land surface form fields.

---

## Bug #2: Fragment Details — Missing Total Percentage Validation for Color Type

**Severity:** Medium (data quality / consistency issue)

**Steps to Reproduce:**
1. Select any media type (e.g., "In Water") and proceed to Sample Details
2. In the **Microplastics Details** section, observe that all percentage categories (Size, Color, Form, Polymer) have a green **"Current Total: 100.0%"** validation banner that shows whether the total is correct
3. Scroll down to the **Fragments Details** section
4. Look at **"1. Color type: Percentage of particles estimated to be in each color type"** for fragments

**Expected Behavior:** The Fragment Details Color type section should display the same "Current Total: XX%" validation banner, consistent with all other percentage-based sections (Microplastics Size, Microplastics Color, Microplastics Form, Fragments Form, etc.).

**Actual Behavior:** The Fragment Details Color type section is **missing the total percentage validation banner**. Users can enter values that don't sum to 100% without any warning.

**Evidence:** Compare the following pages in `DataTool_Test.pdf`:
- Page 5: Microplastics Size — has green "Current Total: 100.0%" banner ✅
- Page 6: Microplastics Color — has green "Current Total: 100.0%" banner ✅
- Page 6: Microplastics Form — has green "Current Total: 100.0%" banner ✅
- Page 7: Fragment Details Color type — **NO validation banner** ❌
- Page 8: Fragment Details Form — has green "Current Total: 100.0%" banner ✅

**Notes:** This is likely a missing component or a rendering condition that was not applied to the fragment color section. Check the fragment color form component and ensure it has the same total validation logic as all other percentage distribution sections.

---

## Bug #3 / Feature Request: Cannot Edit Location Details After Selecting Existing Location

**Severity:** Low-Medium (usability / data accuracy issue)

**Current Behavior:**
When a user tries to enter a new location with the same name as an existing one (e.g., "Saint Clair Lake"), the system prompts the user to select it from the dropdown menu ("Select previously sampled location"). Once selected from the dropdown, the location fields (latitude, longitude, location description) are auto-populated and **locked/non-editable**.

**Problem:**
Different sampling events at the "same" named location may have different:
- **Latitude / Longitude** (samples taken at different points within the same lake)
- **Location Description** (e.g., "North shore" vs. "Center of the lake" vs. "Near inlet")

The current design forces all samples at a named location to share identical coordinates and descriptions, which does not reflect real-world sampling scenarios.

**Requested Behavior:**
After selecting an existing location from the dropdown, allow the user to **edit** the latitude, longitude, and location description fields. This way:
- The location name and short code remain consistent (useful for grouping)
- But the specific sampling coordinates and descriptions can vary per event

**Alternative Solutions (if full editing is complex):**
1. Allow "duplicate" location names with different coordinates by treating them as separate entries
2. Add a "New sub-location" option under an existing location
3. Allow editing only latitude, longitude, and description while keeping name/short code locked

---

## Successfully Tested Cases (Reference)

### Case 1 — In Water (PDF pages 1–13)
- Location: Saint Clair Lake (42.514510, -82.777542)
- Media: In Water → Lake
- Environment: Great Lake
- Date: 2026-02-06, 08:30 AM
- Weather: 23°C, Sunny
- Microplastics: 10 count in 5L, Fragments: 5 count in 5L
- All percentage distributions filled, all totals validated at 100%
- Review page: **All required fields completed and data validation passed** ✅

### Case 2 — In Aquatic Sediment (PDF pages 14–25)
- Location: Saint Clair Lake (same location, reused)
- Media: In Aquatic Sediment → Sludge (Wastewater Treatment)
- Date: 2026-02-06, 08:30 AM
- Sediment details: depth 1m, dry weight 30g, organic matter 20%, moisture 30%, sand 60%, silt 30%, clay 10%
- Microplastics: 5 count in 30g, Fragments: 10 count in 30g
- All percentage distributions filled, all totals validated at 100%
- Review page: **All required fields completed and data validation passed** ✅

### Case 3 — On Soil or Land Surface (Screenshot only)
- **Blocked by Bug #1** — could not proceed past Additional Sampling Information
