# Dataset provenance and preparation

## Scope and current manifest

The classifier supports Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). English is native Latin script; its romanized cell is N/A. The target is 500 rows in each of 11 applicable cells (5,500 rows total). Counts below are observed after NFC normalization and exact normalized-text deduplication; no target count is forced.

The current dataset contains **5,000 unique source rows**: 2,000 native-script/Latin rows, 1,500 romanized Indic rows, and 1,500 genuine code-mixed rows. Counts by language are English 1,000, Hindi 1,500, Odia 1,000, Tamil 1,500. There are 4,500 CC-licensed-source rows, 500 public-domain-source rows, zero dataset-generated rows, and zero synthetic augmentation rows. The only unfilled cell is Odia code-mixed: 0/500; do not fill it with synthetic or generated text and call it genuine.

The merged normalized TSV is **1,538,841 bytes**. Its component TSVs total 1,539,021 bytes. Downloaded source files total **137,199,293 bytes**; no audio files were downloaded. Exact source file hashes, file sizes, source/license counts, cell counts, and train/validation/test distributions are stored in `ml-service/artifacts/dataset-manifest.json`. Raw and processed text files are ignored by Git.

| Language | Native script / Latin | Romanized | Genuine code-mixed |
|---|---:|---:|---:|
| English (`en`) | 500 | N/A | 500 English-dominant Hindi-English |
| Hindi (`hi`) | 500 | 500 | 500 Hindi-dominant Hindi-English |
| Tamil (`ta`) | 500 | 500 | 500 Tamil-English |
| Odia (`or`) | 500 | 500 | 0; source gap |

English-only text is not labelled code-mixed. COMI-LINGUA samples require token annotations containing both Hindi and English; Tamil code-mixed samples require both Tamil Unicode characters and Latin letters in the same comment. IndicCMix was not used: it is gated, its text is dataset-generated, and no Hugging Face credential was available in the workspace. Its audio was not downloaded.

## Sources, licenses, and observed counts

### Bhasha-Abhijnaanam and Dakshina

The downloaded ZIP is 10,706,705 bytes and contains one JSON member, `bhasha-abhijnaanam.json` (66,171,773 uncompressed bytes), with 88,014 records. Fields inspected: `language`, `native sentence`, `romanized sentence`, `script`, `source`, and `unique_identifier`. Selected source pairs were Hindi/Dakshina (4,616 raw pairs; 4,605 unique after normalized pair deduplication), Tamil/Dakshina (4,802 raw; 4,767 unique), and Oriya/Manually-Collected (512 raw and unique). The sampler selected 500 paired records per language, giving 3,000 rows across native and romanized categories. Pair variants share a group ID and remain in one split.

The Bhasha card identifies the manually collected data as CC0-1.0. Hindi/Tamil Dakshina source text carries CC BY-SA 4.0 attribution and share-alike terms. Because Bhasha-Abhijnaanam is itself an existing language-identification benchmark, these reused examples are project train/validation/test data and are not presented as an independent evaluation on that benchmark. Sources: [Bhasha-Abhijnaanam](https://huggingface.co/datasets/ai4bharat/Bhasha-Abhijnaanam) and [Google Dakshina](https://github.com/google-research-datasets/dakshina).

### Hindi-English code-mixed data

From the 123,492,954-byte COMI-LINGUA `LID_train.csv`, the preparation script selected 500 Hindi-dominant and 500 English-dominant samples. Both languages must have token annotations from at least two annotators; balanced annotations are rejected. Thus English-only lines are not selected as code-mixed. The project follows the repository's CC BY-SA 4.0 license because the repository license is stricter than the README's CC BY 4.0 statement. The source hash, eligible counts, row counts, and output bytes are in the source manifest. Source: [COMI-LINGUA repository](https://github.com/lingo-iitgn/COMI-LINGUA).

### Tamil-English code-mixed data

The downloaded Tamil-only train parquet is 2,392,028 bytes and contains 35,139 rows with `text` and integer `label` columns. The source split has 1,454 rows labeled `not-Tamil`; they were excluded. Requiring at least one Tamil Unicode character and at least one Latin letter yielded 1,574 candidate rows, 1,556 unique after NFC/casefold/whitespace deduplication. The sampler selected 500 real mixed-script comments. English-only rows cannot pass this script check. The dataset card declares CC BY 4.0 and cites the DravidianCodeMix research corpus; it identifies YouTube comments but leaves initial collection details unavailable. The source may contain offensive language, and the comments may not represent general or formal speech. Source: [OffensEval Dravidian Tamil split and license](https://huggingface.co/datasets/community-datasets/offenseval_dravidian).

Latin-only Tanglish was excluded because automatic language distinction from English-only text was not reliable enough for this project, and other uploader claims did not establish clear rights over underlying social-media posts. No synthetic Tanglish was created.

### English native/Latin data

The downloaded Project Gutenberg text for ebook 1661 is 607,606 bytes. After removing Gutenberg framing, 4,280 unique source sentences passed the length filter; 500 actual sentences were sampled. The source is public domain in the United States. Arthur Conan Doyle died in 1930; India’s Copyright Act section 22 provides a term of 60 years from the start of the year following the author’s death for published literary works, so the term expired in India in 1990. See the [Gutenberg item](https://www.gutenberg.org/ebooks/1661), [Gutenberg license policy](https://www.gutenberg.org/policy/license.html), and [Indian Copyright Act section 22](https://copyright.gov.in/Copyright_Act_1957/chapter_v.html).

## Cleaning, groups, and split

Text is normalized to Unicode NFC, with whitespace normalized. Indic code points and joiners are preserved. Empty, replacement-character, and NUL-containing records are rejected. Exact normalized duplicates within each language/category cell are removed before splitting. Group IDs join source sentence pairs and exact text duplicates across sources; no source group is shared across train, validation, or test.

The 5,000-row dataset was split with `StratifiedGroupKFold` into 3,000 train, 1,000 validation, and 1,000 test rows (2,100, 700, and 700 groups respectively). The manifest records each split’s language, category, and origin distributions. The Tamil code-mix source provided no pair variants; its normalized exact-text hash is the group ID. This split evaluates language identification, not translation quality or production audio recognition.

The raw ZIP, CSV, Gutenberg text, Tamil parquet, and prepared TSVs are not committed. Keep all required source attributions and license terms with any redistributed dataset or derived corpus.
