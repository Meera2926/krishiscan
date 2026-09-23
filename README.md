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
| **Expert review** | Uncertain scans queue for an agronomist; their corrections never overwrite the model's original answer, so model-vs-expert agreement measures real field accuracy. |
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
| `npm test` | 74 server tests: diagnosis triage, photo quality, severity, progression, risk rules, API |
| `npm run build` | Production React build; Express serves it from the same origin |
| `npm run seed` | Crops and diseases (`-- --demo` adds demo data) |
| `node server/scripts/evaluate-models.js <dir>` | Accuracy, rejection rate and latency on your own labelled photos |

## Project layout

```
server/src
  routes/        auth, plots, scans, treatments, library, outbreaks, risk, reviews
  services/
    inference/   catalog.js (pinned models), local.js (ONNX), mock.js (tests)
    diagnosis.js triage: not-a-leaf gate, crop conditioning, confidence bands
    severity.js  lesion-area severity estimate
    progression.js trend, AUDPC, treatment efficacy
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

- **The models were trained mostly on lab-style images.** Published work shows accuracy falling from
  ~99% on PlantVillage to ~31% on field photos (Mohanty et al., 2016). Our own 41-image smoke test
  scored well, but most of those images are likely in the models' training data, so it is **not** an
  accuracy measurement. Measure on your own field photos with `evaluate-models.js`.
- **Wheat is the weakest crop.** On real field photos the model confused wheat rust with maize rust;
  the app recovers by trusting the farmer's crop choice and marking such results uncertain.
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
