# Egyptian drug source findings

Source: [mahmoudfalous/eg-drugs](https://github.com/mahmoudfalous/eg-drugs), `main` branch, latest visible commit `e19709c` at the time of review.

The repository publishes `data/eg_drugs.csv` at approximately 22.1 MB and `data/eg_drugs.json` at approximately 36.5 MB. Both are UTF-8; CSV is suitable for SQLite-oriented ingestion and JSON is suitable for application/API use. The README identifies a June 2026 dataset version and a last-updated date of 21 June 2026.

The documented fields are: `id`, `name`, `arabic`, `active`, `company`, `price`, `oldprice`, `availability`, `barcode`, `slug`, `units`, `description`, `uses`, `matched_fda_ingredients`, `uses_summary`, `uses_summary_en`, seven condition warning flags (`warning_high_blood_pressure`, `warning_diabetes`, `warning_pregnancy`, `warning_lactation`, `warning_kidney`, `warning_liver`, `warning_heart`), and Arabic/English warning summaries. The warning flags use `1` for a detected warning/caution and `0` for no detected warning.

The README states that the dataset is available for personal, educational, research, and non-commercial projects, and that commercial use may require separate permission from the dataset owner. Elite Clinic should therefore store attribution and source-license metadata on every imported snapshot and require an explicit Admin confirmation of the clinic’s permitted use before promotion.

Implementation consequence: import must pin the source commit and file hash, preserve the raw snapshot metadata, parse the documented fields defensively, treat price and warning flags as untrusted source data requiring validation, and keep promotion separate from downloading or parsing.
