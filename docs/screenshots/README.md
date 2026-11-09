# UI screenshot artifacts

Planned live URL: <https://driedsandwich.github.io/trial-questions/> (publication is an owner action).

Capture fresh screenshots with `scripts/capture-ui.mjs`, following the root README. Pass an output directory **outside this repository**. Live trial records are not bundled with the application or committed as screenshots.

A capture run writes these files to the output directory you pass:

- `desktop-search.png` and `mobile-search.png`: first-use search page.
- `desktop-trials.png`: results from a live ClinicalTrials.gov request.
- `desktop-questions.png` and `mobile-questions.png`: the selected live trial.
- `desktop-paired-detail.png` and `mobile-paired-detail.png`: the same original/question pairs at desktop and 390px widths.
- `desktop-visit-sheet.png` and `mobile-visit-sheet.png`: visit sheet selection and preview.
- `live-visit-sheet.pdf`: headless print output, containing public trial criteria only; no patient input.
- `capture-metadata.json`: viewport sizes, capture time, trial ID, and counts; no API response snapshot.

The capture is a point-in-time view of live data. Future searches can return different records or recruitment statuses. The screenshots are implementation artifacts, not a built-in demo mode or medical advice. Empty/failed searches stop the capture with an error; no fictional data is substituted.
