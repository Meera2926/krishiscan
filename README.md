# KrishiScan — AI-driven crop disease prediction

A MERN web app that diagnoses crop disease from a leaf photo, **tracks how the disease progresses**,
checks whether a treatment worked, and warns farmers before symptoms appear.

Built for six crops grown across India: **rice (paddy), wheat, maize (corn), potato, tomato and
grape** (27 disease and healthy classes). Crop pickers and the API accept either name, because
picking the wrong crop does not fail — it routes the photo to another crop's classifier.

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
| **Accessibility** | English and Hindi UI, spoken advice through the browser's speech API, installable PWA, works on a free hosting tier. |

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. With no `MONGO_URI` set, the server starts a throwaway in-memory
MongoDB and seeds it, including demo accounts:

- farmer: `farmer@demo.in` / `demo1234` (plots, a progression series and a logged treatment)
- expert: `expert@demo.in` / `demo1234` (sees the review queue)

The first start downloads ~32 MB of model weights and, for the in-memory database, a MongoDB binary.

### Real database and persistent images

Copy `server/.env.example` to `server/.env` and set `MONGO_URI` (MongoDB Atlas works on its free
tier). Then seed the knowledge base:

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
| `npm test` | 100 server tests: diagnosis triage, photo quality, severity, progression, consultations, retention, remedies, risk rules, API |
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

Both are pinned to exact Hugging Face commits in `server/src/services/inference/catalog.js`, so a
model can never change under the app:

| Model | Covers | Size |
|---|---|---|
| `onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX` | tomato, potato, maize, grape (PlantVillage, 38 classes) | 9 MB |
| `wambugu71/crop_leaf_diseases_vit_onnx` | rice, wheat, maize, potato, plus an `Invalid` class | 22 MB |

The ViT's `Invalid` class doubles as the not-a-leaf gate for every crop. Measured on this machine:
**~90 ms per image on CPU, ~165 MB resident**, which fits a 512 MB free instance.

## Honest limitations

Read these before quoting any accuracy number.

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
| **Yes** | They pick a phone call, a live chat or a farm visit, and a slot. The case is kept until it is answered or cancelled. The chat thread opens with the diagnosis, confidence, severity and treatment history already written into the first message, so neither side starts from a blank page. |
| **No**, or no answer | Reminders appear on the dashboard on day 2 and day 5. On day 7 the consultation **and the scan it was raised for, including the photo**, are deleted. |

The deadline is shown on the result page, on the dashboard and on the consultation itself, with the
exact date, before the farmer answers. Only cases the farmer never booked are ever deleted; booked
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
