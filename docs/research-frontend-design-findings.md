# Frontend Design Research Findings

## Material 3 official source

Source: [Material Design 3](https://m3.material.io/), visited 19 August 2026.

Material 3 describes itself as an open-source design system for building usable products. The current site emphasizes expressive colors, intuitive motion, adaptive components, flexible typography, contrasting shapes, toolbars, split buttons, progress indicators, and button groups. For Elite Clinic, the relevant conclusion is not to copy decorative expressive marketing visuals into a clinical system. Instead, use Material 3 as the token and component foundation, then constrain color, motion, and shape for high-trust clinical work: calm surfaces, clear hierarchy, adaptive layouts, strong focus states, and restrained motion.

The Android implementation should use the Compose-first Material 3 path. Desktop should share the same semantic token names and interaction rules even if its renderer uses custom CSS. The design system should distinguish clinical status colors from decorative accents, and adaptive navigation should change by available width rather than by platform alone.

The source page also exposes current Material 3 foundations for colors, motion, typography, shapes, and components, plus adaptive/expressive components. These are useful reference areas for the subsequent design specification.

## WCAG 2.2 official source

Source: [Web Content Accessibility Guidelines 2.2](https://www.w3.org/TR/WCAG22/), W3C Recommendation dated 12 December 2024, visited 19 August 2026.

WCAG 2.2 is technology-independent and applies across desktops, laptops, kiosks, and mobile devices. It organizes requirements under perceivable, operable, understandable, and robust principles. The design system should map its acceptance tests to the relevant criteria rather than treating accessibility as a final visual pass.

For Elite Clinic, the high-impact requirements are: keyboard access and no keyboard traps; visible focus; minimum and non-text contrast; text resizing and reflow; meaningful sequence and structure; input-purpose identification; error identification and suggestions; consistent help; accessible names/roles/states; target-size and dragging alternatives; and status messages that can be announced without moving focus. The desktop app must work without a mouse, retain visible focus through all modal/form/table flows, and preserve meaningful order when the layout is compacted. The Android app must expose content descriptions, semantic headings, state announcements, and touch targets that remain usable with larger font settings.

## NHS digital service manual design guidance

Source: [NHS Digital Service Manual — Accessibility: Design](https://service-manual.nhs.uk/accessibility/design), visited 19 August 2026.

The NHS guidance recommends designing accessibility into the service from the bottom up, testing with users who have access needs, and using a well-tested design system instead of overlays or accessibility widgets. It specifically calls for semantic landmarks, skip links, unique informative page titles, one clear main heading, correctly ordered headings, strong color contrast, visible focus styles, and link/form names that make sense out of context. It also says custom components should be justified by evidence, tested technically and with users, maintainable, and documented.

For Elite Clinic, this translates into a real application shell with banner/navigation/main landmarks, a keyboard skip path, semantic headings, structured forms, consistent labels and errors, and a small set of shared components rather than repeated bespoke panels. Accessibility controls should be native to the design system—font scaling, contrast, focus, and semantic structure—not a floating widget layered over an inaccessible UI.

## Android RTL source check

The first official Android Developers URL checked for Compose RTL guidance returned a 404 on 19 August 2026, so no claims are being based on that stale path. The implementation should use the current Android Developers documentation/API references for Compose layout direction and localization when coding. The design decision remains: use start/end layout primitives, support Arabic as a full locale rather than a translated overlay, keep mixed-direction identifiers such as patient IDs, phone numbers, dates, and ICD-10 codes isolated with appropriate bidi handling, and test both LTR English and RTL Arabic layouts on the actual Android workstation.

## Arabic typography and Android localization

Sources: [Noto Sans Arabic](https://fonts.google.com/noto/specimen/Noto+Sans+Arabic), [Android support different languages and cultures](https://developer.android.com/training/basics/supporting-devices/languages), and [Jetpack Compose accessibility](https://developer.android.com/develop/ui/compose/accessibility), visited 19 August 2026.

Noto Sans Arabic is a sans-serif design for Middle Eastern Arabic, with multiple weights and widths, 1,642 glyphs, 12 OpenType features, and support for 1,161 characters across six Unicode blocks. It is a strong candidate for the primary Arabic UI face, paired with Noto Sans for English and Latin-heavy clinical identifiers. The app should bundle or otherwise reliably provision the fonts rather than depend on an internet connection, because the clinic is local-first/offline.

Android’s language guidance says localization requires more than translating strings: the app must use RTL layout for RTL locales, declare the direction of embedded text, handle mixed-direction messages, use locale-appropriate number/date formatting, and test mirrored layouts. The app should wrap inserted patient names, phone numbers, addresses, IDs, and other mixed-direction values with bidi-aware formatting when placed inside localized sentences. Medical identifiers such as ICD-10 codes and EL-00001 patient IDs should remain machine-readable and visually isolated from Arabic sentence flow.

Current Compose accessibility guidance emphasizes semantics, traversal order, scalable text and UI, semantic headings, live regions for important status updates, pane titles for window-like surfaces, error semantics, progress semantics, collection metadata for lists, state descriptions, and custom accessibility actions. These should be built into the component library and used for both UI behavior and automated Compose tests.

## Windows desktop and Fluent 2 comparison

Sources: [Fluent 2](https://fluent2.microsoft.design/), [Fluent 2 Accessibility](https://fluent2.microsoft.design/accessibility), [Fluent 2 Design Tokens](https://fluent2.microsoft.design/design-tokens), [Fluent 2 Color](https://fluent2.microsoft.design/color), and [Fluent 2 Typography](https://fluent2.microsoft.design/typography), visited 19 August 2026.

Fluent 2 is useful as a Windows interaction reference, not as a brand to copy. Its guidance supports design tokens with global raw values and semantic alias tokens; neutral, shared, and brand palettes; semantic colors used only for meaning; and clear hierarchy through type, spacing, dividers, and surfaces. It explicitly recommends visible focus, logical focus order, restoring focus after temporary UI closes, responsive reflow, concise language, and WCAG contrast. It provides a Windows type ramp built around Segoe UI Variable, including a compact 14px body and 20px subtitle tier, which is a good reference for a dense desktop clinic workspace.

Elite Clinic should therefore use a cross-platform semantic token layer with separate desktop and Android platform mappings. The Windows surface can feel native through Segoe UI/system typography, restrained borders, soft neutral surfaces, predictable hover/selected states, and keyboard-first interaction. It should not inherit Fluent’s broad M365 branding or overuse blue. Brand color belongs to the app identity, primary actions, and selected navigation; semantic colors must remain reserved for clinical, sync, security, billing, and destructive states.

## Healthcare usability and patient-safety evidence

Sources: [AHRQ — Improving EHR Usability for Patient Safety](https://digital.ahrq.gov/program-overview/research-stories/improving-electronic-health-record-usability-patient-safety), [Olakotan et al. 2025 scoping review](https://pmc.ncbi.nlm.nih.gov/articles/PMC12206486/), and [Cahill et al. 2025 systematic review](https://pmc.ncbi.nlm.nih.gov/articles/PMC11705737/), visited 19 August 2026.

AHRQ reports an association between poor EHR usability and patient-safety events, workflow disruption, cognitive burden, and provider burnout. The 2025 scoping review identifies task switching, excessive navigation, fragmented critical information, redundant documentation, and weak searchability as recurring problems. Its desired features include consolidated tasks, interruption management, split-screen or multi-pane layouts, progressive disclosure, structured fields, robust search/filtering, consistent navigation, and direct paths between related tasks. The 2025 systematic review links EHR design to medication safety and groups influential design themes into searchability, automation, customization, data entry, workflow, user guidance, and interoperability.

The implication for Elite Clinic is that visual polish must serve workflow safety. The redesigned desktop should provide a persistent patient context, fast global search, task-focused workspaces, split views where chart review and documentation coexist, progressive disclosure for advanced governance data, structured clinical templates, nonintrusive status feedback, and configurable default views. Alerts should be rare, contextual, and actionable; routine sync or administrative notices belong in a status center rather than interruptive modal pop-ups. The Android UI should prioritize a small number of field workflows, strong summaries, large touch targets, and direct access to current tasks rather than reproducing the entire desktop information density.
