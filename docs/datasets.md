# Dataset plan and provenance

## Scope

The classifier is text-only. Project labels are Hindi (`hi`), English (`en`), Tamil (`ta`), and Odia (`or`). The sample target is 500 rows in each applicable language/category cell. Hindi, Tamil, and Odia have native-script, romanized, and code-mixed categories. English uses Latin natively and has no romanized category; it has native/Latin and code-mixed categories. This yields 5,500 applicable target rows. Synthetic augmentation is recorded separately and never counted as verified source text.

## Candidate sources and verified metadata

- **AI4Bharat IndicCMix:** the dataset card describes the selected Odia and Tamil text fields `native_script_codemixed` and `english`. Its license is listed as MIT. The card says the Indic text is translated from English and the associated F5-TTS audio is synthetic. Treat these examples as dataset-provided generated text, not naturally authored conversation. The dataset is gated behind a Hugging Face information-sharing and access-conditions step. The user has said they will accept the access conditions; local authorization is still to be verified. If available, fetch only the Odia and Tamil parquet files, project only text columns, and never request the audio directory. Keep all variants of a source sentence in one split.
- **AI4Bharat Bhasha-Abhijnaanam:** its card describes a native and romanized language-identification test set and lists a CC0-1.0 license for manually collected data. Published selected-language counts are Hindi 5,617 native / 4,606 romanized, Odia 1,012 / 512, and Tamil 5,893 / 4,881; the repository archive is listed as 10.7 MB. These are upstream reported counts, not local downloads or project counts. This is a benchmark test set; if examples are used for fitting, they cannot also be represented as an independent benchmark test result.
- **Google Dakshina 1.0:** provides Hindi and Tamil native-script Wikipedia text and romanization resources, but not Odia. It is licensed CC BY-SA 4.0. Preserve attribution and share-alike obligations for derivatives. Use only needed text files, not the full archive.

- **COMI-LINGUA:** expert-annotated Hindi-English code-mixing. The repository includes a CC BY-SA 4.0 license file while its README states CC BY 4.0; use the stricter repository CC BY-SA 4.0 terms unless the authors clarify the mismatch. The preparation script uses only `LID_train.csv`, requires majority-supported mixed annotations, and derives Hindi-dominant and English-dominant sentence labels separately.
- **Project Gutenberg ebook 1661:** public-domain-in-the-USA English prose provides English native/Latin samples. The preparation script samples actual source sentences and records the downloaded text file's byte count. Public-domain status varies by jurisdiction; attribution/provenance is retained.
- **Tanglish Corpus 185k (not used):** the uploader claims CC BY 4.0, but the card says it contains scraped third-party YouTube/Reddit comments. That license claim is not independently verified as rights to the source comments, so it is excluded from the project training set.

For academic attribution, cite the Bhasha-Abhijnaanam paper (Madhani et al., 2023, “Bhasha-Abhijnaanam: Native-script and Romanized Language Identification for 22 Indic Languages”), the Dakshina paper (Roark et al., 2020, “Processing South Asian Languages Written in the Latin Script: The Dakshina Dataset”), and Sheth et al. (2025), “COMI-LINGUA: Expert Annotated Large-Scale Dataset for Multitask NLP in Hindi-English Code-Mixing.” Preserve each source license’s attribution/share-alike terms in any redistributed dataset or derived corpus.

Downloaded and prepared so far: 4,500 unique source samples (3,000 paired native/romanized Bhasha examples, 1,000 COMI-LINGUA code-mixed examples, and 500 Project Gutenberg English sentences), from 10,706,705 archive bytes, 123,492,954 CSV bytes, and 607,606 English text bytes. The merged deduplicated TSV is 1,294,635 bytes. Synthetic augmentation count: 0. Remaining target cells are Tamil/Odia code-mixed (1,000). IndicCMix remote parquet listings for these files are approximately 42.7 MB (Odia) and 44.6 MB (Tamil); local byte counts remain zero pending successful gated access. Hindi and English code-mixed cells are already present in the COMI-LINGUA output. Source URLs: [IndicCMix](https://huggingface.co/datasets/ai4bharat/IndicCMix), [Bhasha-Abhijnaanam](https://huggingface.co/datasets/ai4bharat/Bhasha-Abhijnaanam), [COMI-LINGUA](https://github.com/lingo-iitgn/COMI-LINGUA), [Dakshina documentation](https://github.com/google-research-datasets/dakshina), and [Project Gutenberg ebook 1661](https://www.gutenberg.org/ebooks/1661).

The ML pipeline must record dataset version/configuration, source URL, license, retrieval date, selected fields, filtering, deduplication, language labels, and split strategy. Keep raw and processed datasets out of Git. Avoid placing personal or restricted data in examples.

## Preparation requirements

1. Record source version, URL, license, retrieval date, file size, selected columns, source counts, filtering, deduplication, and split strategy.
2. Select text-only parquet columns; exclude the audio field and audio directories.
3. Preserve native and romanized script distinctions. Do not generate unmarked samples and call them real.
4. Deduplicate before splitting and keep paired/variant source sentences together.
5. Record counts by language, category, and origin. Do not count synthetic augmentation toward the verified target.
6. Hold out code-mixed and ambiguous examples for evaluation where source data allows. Never publish unrun metrics.
