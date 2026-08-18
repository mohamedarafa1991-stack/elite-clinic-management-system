# eg-drugs source findings

**Research date:** 18 August 2026

The upstream repository is `https://github.com/mahmoudfalous/eg-drugs`, public on GitHub. Its `main` branch showed latest repository commit `e19709c` on 20 June 2026; the `data` directory showed commit `99f80e6` on the same date. The repository displayed one branch and no published releases.

The README describes 26,562 Egyptian pharmaceutical product records, Arabic and English fields, active ingredients, FDA ingredient mapping, prices, availability, barcodes, localized usage summaries, and generated warning flags. It publishes `data/eg_drugs.csv` at approximately 22.1 MB and `data/eg_drugs.json` at approximately 36.5 MB, both UTF-8. The JSON is a large array rather than a stated versioned release artifact.

The documented fields include `id`, `name`, `arabic`, `active`, `company`, `price`, `oldprice`, `availability`, `barcode`, `slug`, `units`, `description`, `uses`, `matched_fda_ingredients`, `uses_summary`, `uses_summary_en`, warning flags for hypertension/diabetes/pregnancy/lactation/kidney/liver/heart, and Arabic/English warning summaries. The README says the warning flags are automatically generated from ingredient-level FDA safety information.

The documented processing pipeline includes collection, cleaning, normalization, name/company standardization, active-ingredient extraction, FDA matching, Arabic usage generation, English FDA-based summary extraction, warning detection, and CSV/JSON export. The README states that the dataset is available for personal, educational, research, and non-commercial use and that commercial usage may require separate permission. The repository has no release artifacts, so an Elite Clinic import must pin a commit hash and source-file hash rather than treating the moving `main` branch as a release.

These findings support a Hub-only, staged, Admin-reviewed import. The dataset should be treated as a candidate medication catalog, not as a clinical prescribing authority. Price, availability, usage summaries, and generated warnings require explicit provenance labels, freshness timestamps, validation, and a visible disclaimer before clinical use.
