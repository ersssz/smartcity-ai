# Independent source review: 0.3.3 / code 8

2026-10-20. Compared the actual working-tree delta against `e92cb85`. This review made no source, device, network, installation, API or payment changes; only this report was written.

## Source result: PASS

The only product behavior delta is `collapsable={false}` on the permanent `CityIntro` map-container `View`, plus its explanatory comment. Package/app/Gradle metadata consistently change 0.3.2/code 7 to 0.3.3/code 8. `CityOpening.tsx`, the camera-fit behavior, geometry, content, persistence and walk commands are unchanged. No additional dependency or permission was introduced.

The fix addresses a concrete hierarchy transition visible in the installed React Native source. In `ReactCommon/react/renderer/components/view/ViewShadowNode.cpp:43-71`, `pointerEvents=None`, hidden accessibility descendants and non-Auto accessibility settings force `FormsStackingContext`/`FormsView`. Once the opening ends, those gates change to normal; the plain absolute map wrapper otherwise has no background/border/native-ID/etc. requiring its native view. `collapsable=false` unconditionally retains those traits across the transition. `ReactCommon/react/renderer/mounting/Differentiator.cpp:396-418` explicitly describes flatten/unflatten reparenting and the required remove/insert operations. Retaining the wrapper therefore prevents that avoidable reparenting of the native map subtree while the opening modal gates lift.

Installed MapLibre's Android `MLRNMapView.kt:209-223` forwards native attach/detach to its superclass. Its detached-view guards are also consistent with the importance of retaining the attachment, but they alone do not prove the cause of a visual blank. The actual code 7 filmstrip showed the geospatial surface blanking after the reveal while React Native controls remained visible. The hierarchy finding is a strong source-supported candidate for that symptom; physical confirmation remains necessary.

The change preserves the compact card, explicit map input/accessibility gating, static bank/river annotation children, skip and Reduce Motion/manual continuation, source geometry and saved walk state. No new blocking source finding was found.

Independently checked final hashes:

- `CityIntro.tsx`: `512aa03f79a42c2c7b753c44fc716ae0f6632209ea06787e67212e9bcbc65f04`.
- Unchanged `CityOpening.tsx`: `627d7b92062f1976f25709fd89b4f01edf64e4708e0d81cbaf46920b4f047ce2`.

## Physical result: PENDING

No new APK/device interaction or video was evaluated here. Source PASS does not resolve the observed native blank by itself and does not accept animation smoothness. The next actual code 8 recording must show an uninterrupted map surface across the modal's final removal, readable bank/river labels, stable camera framing and usable compact controls. Camera settlement behavior is deliberately unchanged in this isolated build; revisit it separately only if the new physical evidence still shows a defect.
