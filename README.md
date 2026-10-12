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
| **Photo diagnosis** | Three ONNX classifiers run *inside Node.js* (no Python, no paid API): a PlantVillage MobileNetV2 and a crop-leaf ViT, both downloaded and pinned, and a MobileNetV3 trained here for onion, garlic and the brassicas. Each crop is routed to the model(s) that know it; maize and potato use both downloaded models and their predictions are averaged. |
| **Honest answers** | Non-leaf photos are rejected, the top three possibilities are shown with confidence, and predictions are conditioned on the crop the farmer selected. Uncertain scans go to an expert queue instead of guessing. |
| **Disease progression tracking** | Every scan is scored for lesion severity (% of leaf area affected) by colour segmentation. A plot's scans form a severity timeline with a trend (getting worse / better / stable), AUDPC, and a projection of when it could turn severe. |
| **Treatment efficacy + safe harvest** | Log a spray, and the app compares severity before and after it to say whether it worked, and computes the safe-to-harvest date from the product's pre-harvest interval. |
| **Weather risk forecast** | 13 rules from published epidemiology (Hutton Criteria, ICAR-CPRI **JHULSACAST**, TOMCAST, TNAU rice blast and others) run over a 7-day Open-Meteo forecast. |
| **Outbreak map** | Shared scans are aggregated on a ~5 km grid so no farm can be identified, and farmers are alerted to disease reported within 10 km of their plots. |
| **Expert consultations** | When the app is unsure, or progression shows a spray did not work, the farmer is *asked* whether they want an expert — phone call, live chat or farm visit — and picks a slot and, if they want, a named adviser whose qualification, university, employer, experience and rating from other farmers are shown. The chat opens with the photo, the model's answer and the latest severity already in it, so nobody retells the case. Unanswered offers are reminded for a week, then deleted with their photo. |
| **Verified experts and ratings** | Anyone can apply to advise farmers, but only with an agriculture degree (B.Sc. Agriculture or higher) and a photo of the certificate, and the account sees nothing of any farmer's until an admin has checked that certificate. After a review is answered, the farmer rates the expert from 1 to 5 stars; the average, the spread and the comments (without farmers' names) are shown wherever an expert is chosen. |
| **Organic treatments you can buy** | Each diagnosis lists the organic options already recorded against that disease, names the active behind them, and links a search on retailers that stock farm inputs. Field practices such as crop rotation are listed as advice, with no shop link. |
| **Follow-up reminder** | Every diagnosis names the day to photograph the same leaf again, so progression tracking has a second scan to compare against. |
| **Expert review** | Uncertain scans also queue for an agronomist's label check; their corrections never overwrite the model's original answer, so model-vs-expert agreement measures real field accuracy. |
| **Photo quality check** | Before anything is classified, the photo is EXIF-rotated, measured for sharpness and exposure, and refused outright below 128 px on a side. A dark, overexposed or genuinely unusable photo is called out on the result rather than quietly diagnosed. |
| **Disease library** | The knowledge base is browsable: 32 diseases, plus the 11 healthy classes on request, searchable by free text across common name, pathogen and symptoms, filterable by crop. Every one of the 43 entries names the extension source it was written from. |
| **Your data stays yours** | A scan only reaches the outbreak map if its location was shared, that can be withdrawn afterwards, and a scan can be deleted outright — record and photo. Uploaded photos are stripped of metadata, GPS included, before they are stored. |
| **Accessibility** | UI in English, Hindi, Tamil, Telugu and Malayalam — 617 strings each, and every crop named in all five. Spoken advice through the browser's speech API, installable PWA, works on a free hosting tier. |

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. With no `MONGO_URI` set, the server runs a local MongoDB for you
and keeps its files in `server/.mongo-data`, so the account you register today still logs in
tomorrow. Delete that folder to start from scratch. It is seeded with demo accounts:

- farmer: `farmer@demo.in` / `demo1234` (plots, a progression series and a logged treatment); a second
  farmer, `neighbour@demo.in`, owns the outbreak reports
- experts, already verified: `expert@demo.in`, `anjali.expert@demo.in`, `harpreet.expert@demo.in` / `demo1234`
- admin, who verifies experts: `admin@demo.in` / `demo1234`
- an expert applicant waiting for that check: `applicant@demo.in` / `demo1234`

`/dashboard` resolves by role: a farmer sees their plots, scans and booked reviews; an expert
sees the requests waiting to be taken, their own appointments and what they have answered. Book a
review as the farmer and it appears on the expert's desk without a refresh.

The first start downloads ~32 MB of model weights and, for the local database, a MongoDB binary.

Only one server can use that directory at a time: a second `npm run dev` refuses to start and
says so, because two mongod processes on one data directory corrupts it - in testing the first
server kept serving and then silently lost its database to the second.

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
| `npm test` | 160 server tests: diagnosis triage, the crop gate, photo quality, severity, progression, consultations, expert verification and ratings, retention, remedies, risk rules, configuration, database persistence, API |
| `npm run build` | Production React build; Express serves it from the same origin |
| `npm run seed` | Crops and diseases (`-- --demo` adds demo data) |
| `npm run reset-password -- <email>` | Sets a new password for an account and signs its devices out (prints a generated one if you omit it) |
| `npm run make-admin -- <email>` | Makes an existing account an admin, the only way to get one. Stop `npm run dev` first: it opens the same local database |
| `node server/scripts/evaluate-models.js <dir>` | Accuracy, rejection rate and latency on your own labelled photos |

## Project layout

```
server/src
  routes/        auth, plots, scans, treatments, library, outbreaks, risk, reviews, consultations, experts
  services/
    inference/   catalog.js (pinned models), local.js (ONNX), mock.js (tests)
    diagnosis.js triage: not-a-leaf gate, crop conditioning, confidence bands
    severity.js  lesion-area severity estimate
    progression.js trend, AUDPC, treatment efficacy
    consultation.js when to offer an expert, slots, reminder schedule (pure)
    retention.js  reminders and the week-long delete sweep
    experts.js    expert applications, the certificate, verification decisions, ratings
    remedies.js   organic advice -> product name -> retailer search links
    followUp.js   when to photograph the same leaf again
    risk/        weather-risk rules and engine
  seed/data/     disease knowledge base (symptoms, treatments, sources)
client/src
  pages/         landing, auth, dashboard, scan, result, history, plots, library, outbreaks, reviews,
                 expert application and status, expert profile, admin's expert applications
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
evidence about *which plant is in the photo*, not just which disease. The scan is refused as
`wrong_crop` — naming **no disease at all**, not a guess and not a "healthy" — unless the
declared crop both leads the other four and holds at least `CROP_MATCH_FLOOR` of the mass.

The first version of this test used a single absolute floor of 0.85, swept on held-out photos
from the same datasets the model was trained on, where genuine photos sit at 0.97 median. It
failed on contact with real photographs, which are less peaked: a farmer's own photo of a healthy
onion in a pot put 72% on onion and 21% on cabbage — the right crop, well clear of everything
else — and was refused. So was a brassica leaf with alternaria at 78%.

Swept over 192 genuine photos, 175 impostor attempts (a photo of one of the six older crops
submitted as each new crop), and the photographs that exposed the problem:

| rule | keeps genuine photos | refuses impostors | real photographs |
|---|---|---|---|
| mass ≥ 0.85 (the first attempt) | 99.5% | 97.7% | **refused the right crop** |
| leads the field by ≥ 0.10 only | 100.0% | 80.0% | fine |
| **mass ≥ 0.70 and leads by ≥ 0.10** | **100.0%** | **94.3%** | **fine** |

Three points of impostor rejection is the price of not refusing photographs farmers actually
take, which is the right way round here: a refusal costs a farmer their answer and leaves them
nothing to appeal. The ten that get through are mostly rice and wheat read as onion — all narrow
blades. Using the ViT as a second opinion was measured and rejected: it is just as confident on
crops it has never seen (turnip 0.99 median) as on the ones it knows (rice 0.91), so it would
have refused genuine onion photos just as readily.

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
- **Disease names are translated into Hindi only, and not all of them.** The interface is fully
  translated into all five languages and every crop is named in all five, but only 35 of the 43
  disease entries carry a Hindi name (three grape, two maize and three tomato diseases do not),
  and every disease name falls back to English in Tamil, Telugu and Malayalam. A farmer reading the app in Tamil sees Tamil
  everywhere except the disease name itself. Adding those is a terminology job for someone who
  works in the language, not a translation one.
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
  shows its source. For the six original crops, of 53 chemical entries, 35 doses were confirmed word-for-word against
  a fetched source; the other 18 say "consult your local KVK" rather than guess. The five crops
  added later bring 24 more, written from the source each entry cites; 3 of those also say "consult". Every active ingredient was
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
| **Yes** | They pick a phone call, a live chat or a farm visit, a slot, and an expert — only verified experts are listed, with their qualification, university, employer, experience and rating. The chat thread opens with what the app already knows written into the first message: for a photo, the diagnosis, confidence, crop and latest severity; for a spray that did not work, the product, the date and the severity before and after. Neither side starts from a blank page, and **either side can send more photos into the thread**. The case is kept until it is answered or cancelled. |
| **No**, or no answer | Reminders appear on the dashboard on day 2 and day 5. On day 7 the consultation **and the scan it was raised for, including the photo**, are deleted. |

Cancelling is narrower than it looks: only the farmer whose case it is, the expert actually
handling it, or an admin may cancel, because cancelling an unanswered case starts the deletion
clock and that clock takes the scan and its photograph with it. Cancelling a review an expert has
**already answered** does not start any clock — the advice, the scan and the photo stay. Nor is a
scan deleted once an agronomist has settled it in the label-check queue, even if the consultation
it was raised for expires: that record of what the model said against what an expert said is the
only honest accuracy figure this project has.

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
is searched as a Trichoderma biofungicide, which is how shops list it), and links to retailers.
Only a recognised product or a line with a dose gets links: "remove and destroy infected leaves"
or a three-year rotation is something to do, not something to buy, and is shown as advice alone.

Those links run a **search**, not a product page. The app has no commercial relationship with
any retailer, cannot see stock or prices, and does not rank or recommend between them, so
claiming a particular product is available at a particular price would be an invention. Only
retailers whose search URL was checked by hand are listed — add Indian agri-input specialists to
`RETAILERS` once you have confirmed their search path, because a guessed pattern gives farmers a
dead link. Advice prepared on the farm, such as cow urine sprays, links nowhere by design.

The follow-up date (`services/followUp.js`) is a rule of thumb from how fast the pathogen group
moves — five days for an oomycete, brought forward to three for late blight because it is rated
severe, a fortnight for a virus, sooner when much of the leaf has already gone. It is a reminder to re-photograph, not agronomic advice.

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
to answer an unclaimed case takes it, and from then on only that expert can accept or close it.
Either side can cancel, only the farmer can move the appointment, and closing a case with advice
writes that advice onto the farmer's scan — recorded as the expert's answer, never over the
model's. A closed case refuses new messages and can be neither accepted nor moved again, so a
thread cannot quietly reopen.

`GET /api/reviews/metrics` turns those label checks into the only accuracy figure that comes from
real fields: how many scans were confirmed, how many corrected, the agreement rate, a per-crop
breakdown and the model's most common confusions.

## Who counts as an expert, and what farmers say about them

Farmers act on what an expert tells them, so being one is not something you can type into a
profile. Anyone can apply at `/register/expert`, but only with a degree from a fixed list of
agriculture degrees, bachelor's and above (`models/expertOptions.js`), the university and year,
where they work, and a photo of the degree certificate. The qualification farmers read is built
from the degree chosen, never typed in.

| Status | What the account can do |
|---|---|
| **pending** | See its own application and correct it. No farmer's case, scan, photo or review queue, and it is not in the expert list. |
| **verified** | Everything an expert could do before: take and answer cases, check labels in the review queue. |
| **rejected** | See the admin's reason, fix the application and send it again. |
| **suspended** | Nothing. Their unfinished cases go back to the open queue at once; cases they already answered keep their name. |

Whether an expert is verified is read from the database on every request, not from the sign-in
token, so verifying or suspending someone takes effect on their very next click. The certificate
is kept in the database, not in public storage, and only the applicant and an admin can open it.

Admins check the certificate at `/admin/experts` and verify, reject (with a reason the applicant
sees) or suspend. An admin oversees: sees the cases and the review queue, and can cancel a case,
but does not give advice, because being able to verify experts is not a qualification in
agriculture. There is no way to become an admin from the app; `npm run make-admin -- <email>`
promotes an existing account from the machine the database lives on. Expert accounts that existed
before verification were all created by an administrator (registration has never been able to
create one), so they are marked verified once, when the server starts.

After an expert has **answered** a case, the farmer who raised it can rate them from 1 to 5 stars,
with a comment if they like: once per case, which they may change later. A rating can only come
from someone that expert actually advised. Farmers see the average and the number of ratings in
the expert picker and on each expert's profile, with the spread of stars and the latest comments.
Comments carry no farmer's name or place, and the expert is not shown the rating on their own case,
because a farmer who knows the expert will read it is less likely to say what really happened.

## Accounts, security and health

There is no "forgot password" link, because there is nowhere to send one: no mail provider is
configured, which is why review reminders go to the dashboard rather than to email. A reset link
that cannot be sent is worse than none, so recovery is a local command instead:

```bash
npm run reset-password -- someone@example.com
```

It prints a new password, or takes one as a second argument, and bumps the account's
`tokenVersion` so any device still signed in is signed out. It is deliberately not an endpoint:
whoever can run it already has the database files, and an HTTP route that reset passwords would
be a much larger thing to get wrong.

Sign-in and registration are rate limited separately and for different reasons. Sign-in counts
**failed** attempts only — twenty per IP per 15 minutes — because guessing a password produces
failures and a correct password is not evidence of an attack. Registration has its own hourly
budget and counts only accounts actually created. They were one shared counter once, which meant
failed sign-ins spent the budget for registering: someone whose account did not exist was told
their password was wrong, and then told they had tried too many times when they went to create
one, with no way out but to wait.


Sign-up asks for a name, email and password, and nothing else is required; state, district,
preferred language and the location used for weather risk are all editable afterwards from
**Profile**. Passwords are bcrypt at cost 12. A short-lived access token rides in memory and a
refresh token in an httpOnly, SameSite=Lax, first-party cookie; each account carries a
`tokenVersion`, so logging out invalidates every refresh token issued to it, on every device.

Helmet sets a content security policy that allows scripts only from the app's own origin, JSON bodies are capped
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
7. B. P. Singh et al., "JHULSACAST: A computerized forecast of potato late blight in western Uttar Pradesh," *J. Indian Potato Assoc.* 27:25–34, 2000. The thresholds implemented are its later West Bengal plains calibration (Chakraborty, Singh, Ahmad & Sharma, *Potato Journal*, ICAR), as listed in S. Sharma (ICAR-CPRI), "Status of Late Blight Management in India".
8. S. R. Dancey, P. Skelsey, D. E. L. Cooke, "The Hutton Criteria," *16th EuroBlight Workshop*, 2017, pp. 53–58.
