# Independent city sheet delta review

Reviewed 2026-10-20 against `15c56ed0c591193a6e1061b949a56d1200bdf858` (working-tree delta, before the new APK). Read-only source/data review; only this report was written. No network, installs, API keys, paid calls or device operations.

## Standards

No blocking source findings in the reviewed delta. City browsing remains separate from walk progression/GPS. Version fields consistently identify 0.3.1/code 6; dependency changes are version metadata only.

The new sheet responder is attached only to its handle wrapper, while the bounded `ScrollView` is its sibling with `flex: 1` / `minHeight: 0`. The fixed footer has `flexShrink: 0` and retains the Android navigation inset. The height animation does not update React state on every frame. Camera padding depends on the target sheet height and measured independent chrome/caption sizes, avoiding an animation/onLayout feedback loop. Reduce Motion snaps the sheet and disables camera animation. Hardware Back collapses the sheet before leaving the current city view.

## Spec

No blocking source findings in the reviewed delta. The default card is about 35% of root height, with a bounded accessibility/short-screen adjustment up to 45%; expanded reading is at most 60% on the supported portrait layout. Body text can scroll independently of the persistent CTA. Selecting a district returns the sheet to its compact state.

The default district overview now fits an editorial urban frame instead of all administrative outliers; the full original bounds remain explicitly available under map sources. Six replacement label anchors are within their own original district polygons and within the urban overview. No polygon, river coordinate or source witness was changed. Labels remain native annotations: their exact collision/readability at the selected camera, font scale and locale requires runtime inspection.

## Independent verification

- Existing city app-interface / actual SQLite checks: 4/4 PASS (`node --experimental-sqlite --test tests/cityCatalog.test.cjs tests/cityPreferences.test.cjs`).
- Existing geometry malformed-input checks: 5/5 PASS (`python -X utf8 -B -m unittest discover -s tools/city_intro -p test_geometry.py -v`); these are synthetic cases, not field tests.
- Ran both real local producers with writes intercepted in memory and compared produced bytes against the checked-in working artifacts: PASS. Source data were not rewritten.
- Compared current bundled district and river geometries against the fixed-point Git object: identical.
- Independently checked all 6 new label points inside their corresponding original polygons and the overview frame: PASS.
- Reproduced SHA256: district geometry `75bd63ec2e553cb399158bfd47e7c4ccb648d20ea2ce8591492aeb43ff98507a`; river `a35ae9d4fe99c5bea417720bcd6035d25a7a65c0a5eb85e4babfe703048de7a1`; metadata `2efe0d03cab5e9ea3cbdf490ab25bf39ee00248a89ff50322c3da0788817aba2`; bundled guide `d8730689f64b2b873997bfa4a355ada0e17e5bf628431fc06bf27a96f7a72694`.

## Remaining runtime gate

This review does not accept the new APK, animation smoothness, drag/scroll arbitration, native camera framing, label collisions, enlarged-font layout, TalkBack or safe footer placement on the phone. Check actual Android compact overview and selected Nura, independent text scroll, handle expansion/collapse, full-bounds/overview return and system Back. Existing 0.3.0 phone evidence does not establish those properties for this delta.
