# KrishiScan — AI-driven crop disease prediction

A MERN web app that diagnoses crop disease from a leaf photo, **tracks how the disease progresses**,
checks whether a treatment worked, and warns farmers before symptoms appear.

Built for eleven crops grown across India: **rice (paddy), wheat, maize (corn), potato, tomato,
grape, onion, garlic, cabbage, turnip and broccoli** (43 disease and healthy classes). Crop
pickers and the API accept the local name too — pyaaz, lahsun, patta gobhi, shalgam — because
picking the wrong crop used not to fail, it just routed the photo to another crop's classifier
and got a confident answer back. For the five crops served by the classifier trained here, that
is now caught and refused outright; see **Telling the crops apart** below.

---

## What it does

| Capability | How it works |
|---|---|
| **Photo diagnosis** | Two pretrained ONNX classifiers run *inside Node.js* (no Python, no paid API): a PlantVillage MobileNetV2 and a crop-leaf ViT. Each crop is routed to the model(s) that know it; potato uses both and their predictions are averaged. |
| **Honest answers** | Non-leaf photos are rejected, the top three possibilities are shown with confidence, and predictions are conditioned on the crop the farmer selected. Uncertain scans go to an expert queue instead of guessing. |
| **Disease progression tracking** | Every scan is scored for lesion severity (% of leaf area affected) by colour segmentation. A plot's scans form a severity timeline with a trend (getting worse / better / stable), AUDPC, and a projection of when it could turn severe. |
| **Treatment efficacy + safe harvest** | Log a spray, and the app compares severity before and after it to say whether it worked, and computes the safe-to-harvest date from the product's pre-harvest interval. |
| **Weather risk forecast** | 13 rules from published epidemiology (Hutton Criteria, ICAR-CPRI **JHULSACAST**, TOMCAST, TNAU rice blast and others) run over a 7-day Open-Meteo forecast. |
| **Outbreak map** | Shared scans are aggregated on a ~5 km grid so no farm can be identified, and farmers are alerted to disease reported within 10 km of their plots. |
| **Expert consultations** | When the app is unsure, or progression shows a spray did not work, the farmer is *asked* whether they want an expert — phone call, live chat or farm visit — and picks a slot and, if they want, a named adviser whose qualification, employer and experience are shown. The chat opens with the photo, the model's answer and the severity history already in it, so nobody retells the case. Unanswered offers are reminded for a week, then deleted with their photo. |
| **Organic treatments you can buy** | Each diagnosis lists the organic options already recorded against that disease, names the active behind them, and links a search on retailers that stock farm inputs. |
| **Follow-up reminder** | Every diagnosis names the day to photograph the same leaf again, so progression tracking has a second scan to compare against. |
| **Expert review** | Uncertain scans also queue for an agronomist's label check; their corrections never overwrite the model's original answer, so model-vs-expert agreement measures real field accuracy. |
| **Photo quality check** | Before anything is classified, the photo is EXIF-rotated, measured for sharpness and exposure, and refused outright below 128 px on a side. A dark, overexposed or genuinely unusable photo is called out on the result rather than quietly diagnosed. |
| **Disease library** | The knowledge base is browsable: 21 diseases, plus the six healthy classes on request, searchable by free text across common name, pathogen and symptoms, filterable by crop. Every one of the 27 entries names the extension source it was written from. |
| **Your data stays yours** | A scan only reaches the outbreak map if its location was shared, that can be withdrawn afterwards, and a scan can be deleted outright — record and photo. Uploaded photos are stripped of metadata, GPS included, before they are stored. |
| **Accessibility** | English and Hindi UI, spoken advice through the browser's speech API, installable PWA, works on a free hosting tier. |

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. With no `MONGO_URI` set, the server runs a local MongoDB for you
and keeps its files in `server/.mongo-data`, so the account you register today still logs in
tomorrow. Delete that folder to start from scratch. It is seeded with demo accounts:

- farmer: `farmer@demo.in` / `demo1234` (plots, a progression series and a logged treatment)
- experts: `expert@demo.in`, `anjali.expert@demo.in`, `harpreet.expert@demo.in` / `demo1234`

`/dashboard` resolves by role: a farmer sees their plots, scans and booked reviews; an expert
sees the requests waiting to be taken, their own appointments and what they have answered. Book a
review as the farmer and it appears on the expert's desk without a refresh.

The first start downloads ~32 MB of model weights and, for the local database, a MongoDB binary.

That local database waits for the journal before it acknowledges a write (`w:1, j:true`). It is
slower than the default and deliberately so: a document written and acknowledged, with the process
killed three seconds later, was measurably gone after the restart, and a farmer's account
disappearing because a terminal was closed is not a trade worth making on one machine.

### Real database and persistent images

The local database is for development on one machine. For a shared or deployed database, copy
`server/.env.example` to `server/.env` and set `MONGO_URI` (MongoDB Atlas works on its free tier);
its own connection string then decides the write concern. Then seed the knowledge base:

```bash
npm run seed
```

Add `-- --demo` to include demo users and scans. `STORAGE_DRIVER=cloudinary` stores uploads in
Cloudinary instead of the server's disk, which most free hosts wipe on every deploy.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API on :5000 and Vite on :5173 (Vite proxies `/api`, so dev matches production) |
| `npm run dev:watch -w server` | Same, with the API restarting on source changes |
| `npm test` | 111 server tests: diagnosis triage, photo quality, severity, progression, consultations, retention, remedies, risk rules, database persistence, API |
| `npm run build` | Production React build; Express serves it from the same origin |
| `npm run seed` | Crops and diseases (`-- --demo` adds demo data) |
| `node server/scripts/evaluate-models.js <dir>` | Accuracy, rejection rate and latency on your own labelled photos |

## Project layout

```
server/src
  routes/        auth, plots, scans, treatments, library, outbreaks, risk, reviews, consultations
  services/
    inference/   catalog.js (pinned models), local.js (ONNX), mock.js (tests)
    diagnosis.js triage: not-a-leaf gate, crop conditioning, confidence bands
    severity.js  lesion-area severity estimate
    progression.js trend, AUDPC, treatment efficacy
    consultation.js when to offer an expert, slots, reminder schedule (pure)
    retention.js  reminders and the week-long delete sweep
    remedies.js   organic advice -> product name -> retailer search links
    followUp.js   when to photograph the same leaf again
    risk/        weather-risk rules and engine
  seed/data/     disease knowledge base (symptoms, treatments, sources)
client/src
  pages/         landing, auth, dashboard, scan, result, history, plots, library, outbreaks, reviews
  components/    progression charts, maps, disease advice, shared UI
```

## Models

The two downloaded models are pinned to exact Hugging Face commits in
`server/src/services/inference/catalog.js`, so a model can never change under the app. The third
was trained for this project and ships with it:

| Model | Covers | Size |
|---|---|---|
| `onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX` | tomato, potato, maize, grape (PlantVillage, 38 classes) | 9 MB |
| `wambugu71/crop_leaf_diseases_vit_onnx` | rice, wheat, maize, potato, plus an `Invalid` class | 22 MB |
| `weights/newcrops-v1.onnx` (trained here) | onion, garlic, cabbage, turnip, broccoli (16 classes) | 6 MB |

### The model trained here

No public model covers alliums or brassicas, so adding onion and garlic meant training one.
A MobileNetV3-Small, ImageNet-pretrained, fine-tuned on **3,826 real field photos** from three
CC BY 4.0 datasets:

- onion — *COLD: chilli and onion leaf dataset*, Mendeley `7nxxn4gj5s` (815 photos)
- garlic — *Garlic leaf images for Tipburn identification*, Mendeley `wcgx6bbvw7` (1,088 originals)
- cabbage, turnip, broccoli — *Comprehensive Vegetable Leaf Disease Image Collection*, Mendeley
  `rh8c5tgg5k` (1,923 photos)

**96.9% on a held-out split, 100% crop accuracy** — the crop confusion matrix is diagonal, which
matters because three of these are brassicas sharing the same pathogens. 1.3 ms per image on CPU.
Only the authors' original photographs were used; their pre-augmented copies (6,356 of them for
garlic alone) were discarded, because augmented siblings of a test photo appearing in training
turns an accuracy into a measure of memorisation.

Two traps in this data are worth knowing about if you retrain:

- **2,107 of the 3,826 photos are near-duplicates** — burst shots of the same leaf. Splitting at
  random puts siblings on both sides. `prep.py` groups them by perceptual hash and the split is by
  group, so some classes have far fewer *independent* photos than their file count suggests:
  `cabbage_healthy` is 132 files but 11 independent leaves.
- **The background was the label.** A first model scored 95.4% overall — and 95.1% with the centre
  of every test photo blanked out, because each class had been photographed in its own session.
  Harder augmentation made it worse. The fix was to segment the leaf and replace the surround with
  a per-image random colour, so background carries no class information by construction. The model
  scores the same on unmasked photos, so nothing is segmented at serving time.

Cauliflower was in the same dataset and is **deliberately excluded**: four of its five classes have
13–30 independent photos, which is not enough to be trusted on someone's field.

The ViT's `Invalid` class doubles as the not-a-leaf gate for every crop. Measured on this machine:
**~90 ms per image on CPU, ~165 MB resident**, which fits a 512 MB free instance.

## Telling the crops apart

A farmer picking the wrong crop from the list used to fail silently: the photo was routed to
another crop's classifier, which answered confidently. A corn leaf declared as rice came back
"rice leaf blast, 90%".

For the five crops the model trained here serves, that is now caught. Because one model was
trained on all five at once, how much probability lands on the declared crop's classes is
evidence about *which plant is in the photo*, not just which disease. Below `CROP_MATCH_FLOOR`
the scan is refused as `wrong_crop` and **no disease is named at all** - not a guess, not a
"healthy", nothing.

The floor is 0.85, chosen from a sweep over 192 genuine photos and 175 impostor attempts (a photo
of one of the six older crops submitted as each of the five new ones):

| floor | keeps genuine photos | refuses impostors |
|---|---|---|
| 0.80 | 100.0% | 95.4% |
| **0.85** | **99.5%** | **97.7%** |
| 0.90 | 92.2% | 98.9% |
| 0.95 | 75.0% | 100.0% |

0.95 would turn away every impostor and one real photo in four, which is the wrong way round for
someone standing in a field with a diseased crop. Re-run the sweep whenever the model or the
evaluation set changes.

The six older crops keep the softer rule they always had: their models each know only a few crops,
so a disagreement there means the model is out of its depth, not that the farmer is wrong. Those
scans are flagged `crop_mismatch` and still answered.

## Honest limitations

Read these before quoting any accuracy number.

- **The five new crops score far higher than the six old ones, and that gap is partly the data,
  not the model.** Their photos come from curated research datasets, where a leaf is centred and
  well lit; the six older crops are measured on Wikimedia field photos with whole plants, hands
  and sky in frame. Through the full pipeline the new crops score 92.8-100% per class (onion
  lowest, the brassicas highest), but treat those as an upper bound until they are re-measured on
  photographs taken by farmers. The one cross-dataset signal available is encouraging rather than
  conclusive: the model was trained with backgrounds randomised and scores the same on untouched
  photos.
- **`cabbage_healthy` rests on 11 independent leaves**, and its test split on two. The number
  reported for it is not meaningful; it is kept because a crop without a healthy class forces
  every healthy leaf into a disease.
- **Garlic tipburn is a disorder, not a diagnosis.** Several things cause it — Stemphylium,
  potassium or moisture stress, salinity — and the model only sees that the tips are burnt.
- **Measured accuracy is modest, and this is the honest number.** On `server/eval` — 63 real field
  photos of the six crops plus six non-leaf photos, gathered from Wikimedia Commons and checked by
  eye — the app answers **98% of leaf photos**, is right **50% of the time** when it answers, and
  **67% of the time** on the answers it marks confident. It rejects **100%** of the non-leaf photos.
  Published work sees the same collapse from lab to field: ~99% on PlantVillage, ~31% on field
  photos (Mohanty et al., 2016). Rebuild the benchmark with your own photos and re-run
  `evaluate-models.js` before quoting any figure.
- **Wide shots of a whole field are the main failure.** Healthy rice and wheat photographed as a
  field, rather than as one leaf, are read as diseased. Photograph a single leaf filling the frame.
- **Test-time augmentation did not help.** Averaging over a leaf-region crop, a centre crop and a
  horizontal flip was measured and made top-1 accuracy the same or worse at twice the cost, so the
  app classifies the photo as given.
- **Severity is an estimate from colour**, not a lab measurement. Dark, water-soaked lesions are
  under-counted. It is meant for comparing scans of the same plot over time.
- **Weather risk is an early warning, not a diagnosis.** Several rules are extension-service
  "favourable conditions" rather than validated forecasting models; each rule names its source.
- **Pesticide doses come from Indian extension sources** (TNAU, PAU, ICAR institutes) and each disease
  shows its source. Of 53 chemical entries, 35 doses were confirmed word-for-word against a fetched
  source; the other 18 say "consult your local KVK" rather than guess. Every active ingredient was
  checked against the CIB&RC banned and restricted list of 31.03.2024, and none is banned for these
  crops. Streptocycline is deliberately absent: it has been prohibited in Indian agriculture since
  1 January 2024, though older advisories still recommend it.
- **No pre-harvest interval is pre-filled.** None could be confirmed from the sources available, so
  the app asks the farmer to enter the interval from the product label when logging a spray, and
  computes the safe-to-harvest date from that. Always read the label.

## Expert consultations and what gets deleted

The app offers a human expert exactly where it should not be trusted alone: an uncertain
diagnosis, or a treatment that progression tracking shows is not working. The farmer answers yes
or no — they are never silently added to a queue.

| Answer | What happens |
|---|---|
| **Yes** | They pick a phone call, a live chat or a farm visit, a slot, and an expert — whose qualification, employer and experience are shown. The chat thread opens with the diagnosis, confidence, severity and treatment history already written into the first message, so neither side starts from a blank page, and **either side can send more photos into the thread**. The case is kept until it is answered or cancelled. |
| **No**, or no answer | Reminders appear on the dashboard on day 2 and day 5. On day 7 the consultation **and the scan it was raised for, including the photo**, are deleted. |

Photos sent inside the conversation are deleted with it. The deadline is shown on the result page,
on the dashboard and on the consultation itself, with the exact date, before the farmer answers. Only cases the farmer never booked are ever deleted; booked
consultations have no expiry, and scans that were never flagged are untouched. The sweep runs
hourly from `services/retention.js`; `RETENTION_DAYS` and the reminder days live in
`services/consultation.js`.

Two things a real deployment would need: reminders go to the dashboard, not to email or SMS, because
no provider is configured; and the sweep assumes a single instance, which is what the free Render
tier gives.

## Buying treatments, and what the app will not claim

Each diagnosis shows the organic options **already recorded against that disease** in the
knowledge base, with the source they came from. `services/remedies.js` adds two things and no
more: the name of the active behind a line of advice (so "Trichoderma asperellum @ 1 kg/acre"
becomes a product a shop recognises), and links to retailers.

Those links run a **search**, not a product page. The app has no commercial relationship with
any retailer, cannot see stock or prices, and does not rank or recommend between them, so
claiming a particular product is available at a particular price would be an invention. Only
retailers whose search URL was checked by hand are listed — add Indian agri-input specialists to
`RETAILERS` once you have confirmed their search path, because a guessed pattern gives farmers a
dead link. Advice prepared on the farm, such as cow urine sprays, links nowhere by design.

The follow-up date (`services/followUp.js`) is a rule of thumb from how fast the pathogen group
moves — five days for an oomycete like late blight, a fortnight for a virus, sooner when much of
the leaf has already gone. It is a reminder to re-photograph, not agronomic advice.

## The two desks

`/dashboard` resolves by role, and the navigation is built from the role too — an expert is never
shown "Scan leaf", "History" or "My plots", and those routes are closed to them, because a desk
full of a farmer's tools is a desk nobody can work at.

| | Farmer | Expert |
|---|---|---|
| Home | plots, recent scans, outbreak alerts near their fields, reviews they have booked and the deadline on any they have not answered | today's appointments with a live **Join now**, requests nobody has taken yet, the rest of the week, and what they answered recently |
| Expert reviews | the cases they raised | two tabs: **Waiting for me** (unclaimed, plus anything booked with them by name) and **My own** (their whole caseload, answered ones included) |
| Review queue | — | scans the model was unsure about, waiting for a label check, with the model's agreement rate |

An expert takes a case from the queue, or accepts one booked with them by name; the first expert
to answer an unclaimed case takes it. Either side can cancel, only the farmer can move the
appointment, and closing a case with advice writes that advice onto the farmer's scan — recorded
as the expert's answer, never over the model's. A closed case refuses new messages, so a thread
cannot quietly reopen.

`GET /api/reviews/metrics` turns those label checks into the only accuracy figure that comes from
real fields: how many scans were confirmed, how many corrected, the agreement rate, a per-crop
breakdown and the model's most common confusions.

## Accounts, security and health

Sign-up asks for a name, email and password, and nothing else is required; state, district,
preferred language and the location used for weather risk are all editable afterwards from
**Profile**. Passwords are bcrypt at cost 12. A short-lived access token rides in memory and a
refresh token in an httpOnly, SameSite=Lax, first-party cookie; each account carries a
`tokenVersion`, so logging out invalidates every refresh token issued to it, on every device.

Login and registration are rate limited to 20 attempts per 15 minutes per IP. Helmet sets a
content security policy that allows scripts only from the app's own origin, JSON bodies are capped
at 100 kB, and uploads at one file of `MAX_UPLOAD_MB`, JPEG/PNG/WebP/HEIC only — with the declared
type treated as a first filter, not as proof, since the real check is whether sharp can decode it.

`GET /api/health` reports the database state, the classifier (driver, pinned model version, label
count, load time, and any load error) and the storage driver. It answers `503` when the database is
down and `degraded` when the models have not finished loading, which is what a free instance looks
like for the first few seconds after a cold start.

## Deployment

`render.yaml` deploys one free Render web service that serves both the API and the built React app
(same origin, so no CORS and first-party cookies). Set `MONGO_URI` and the Cloudinary keys in the
dashboard; JWT secrets are generated. On Linux, set `ONNXRUNTIME_NODE_INSTALL=skip` so the install
does not pull ~236 MB of unused CUDA libraries.

## References

1. S. P. Mohanty, D. P. Hughes, M. Salathé, "Using deep learning for image-based plant disease detection," *Front. Plant Sci.* 7:1419, 2016.
2. K. P. Ferentinos, "Deep learning models for plant disease detection and diagnosis," *Comput. Electron. Agric.* 145:311–318, 2018.
3. M. Sandler et al., "MobileNetV2: Inverted residuals and linear bottlenecks," *CVPR*, 2018.
4. D. Singh et al., "PlantDoc: A dataset for visual plant disease detection," *CoDS-COMAD*, 2020.
5. S. J. Pethybridge, S. C. Nelson, "Leaf Doctor: A new portable application for quantifying plant disease severity," *Plant Dis.* 99(10):1310–1316, 2015.
6. G. Shaner, R. E. Finney, "The effect of nitrogen fertilization on the expression of slow-mildewing resistance in Knox wheat," *Phytopathology* 67:1051–1056, 1977. (AUDPC)
7. B. P. Singh et al., "JHULSACAST: A computerized forecast of potato late blight in western Uttar Pradesh," *J. Indian Potato Assoc.* 27:25–34, 2000.
8. S. R. Dancey, P. Skelsey, D. E. L. Cooke, "The Hutton Criteria," *16th EuroBlight Workshop*, 2017, pp. 53–58.
