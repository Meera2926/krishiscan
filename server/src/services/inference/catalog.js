/**
 * The pretrained classifiers KrishiScan runs, pinned to exact Hugging Face commits so a model
 * can never change underneath the app (or underneath a report's accuracy numbers).
 *
 * Each model's raw class labels are mapped to KrishiScan disease keys. Labels for crops we do
 * not support (apple, cherry, ...) map to `other:<model>:<label>`, and "this is not a leaf"
 * classes map to INVALID_LABEL, so the diagnosis step can tell the two apart.
 */

export const INVALID_LABEL = '__invalid__';

export const MODELS = {
  plantvillage: {
    name: 'PlantVillage MobileNetV2',
    repo: 'onnx-community/mobilenet_v2_1.0_224-plant-disease-identification-ONNX',
    revision: '95110a1ffcc188d1b5a36524d52e303e40c2403d',
    file: 'onnx/model.onnx',
    bytes: 9_227_028,
    license: 'other (unspecified by the author)',
    input: 'pixel_values',
    output: 'logits',
    // From the repo's preprocessor_config.json.
    preprocess: { shortestEdge: 256, crop: 224, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
    labels: [
      'Apple Scab', 'Apple with Black Rot', 'Cedar Apple Rust', 'Healthy Apple', 'Healthy Blueberry Plant',
      'Cherry with Powdery Mildew', 'Healthy Cherry Plant', 'Corn (Maize) with Cercospora and Gray Leaf Spot',
      'Corn (Maize) with Common Rust', 'Corn (Maize) with Northern Leaf Blight', 'Healthy Corn (Maize) Plant',
      'Grape with Black Rot', 'Grape with Esca (Black Measles)', 'Grape with Isariopsis Leaf Spot', 'Healthy Grape Plant',
      'Orange with Citrus Greening', 'Peach with Bacterial Spot', 'Healthy Peach Plant', 'Bell Pepper with Bacterial Spot',
      'Healthy Bell Pepper Plant', 'Potato with Early Blight', 'Potato with Late Blight', 'Healthy Potato Plant',
      'Healthy Raspberry Plant', 'Healthy Soybean Plant', 'Squash with Powdery Mildew', 'Strawberry with Leaf Scorch',
      'Healthy Strawberry Plant', 'Tomato with Bacterial Spot', 'Tomato with Early Blight', 'Tomato with Late Blight',
      'Tomato with Leaf Mold', 'Tomato with Septoria Leaf Spot', 'Tomato with Spider Mites or Two-spotted Spider Mite',
      'Tomato with Target Spot', 'Tomato Yellow Leaf Curl Virus', 'Tomato Mosaic Virus', 'Healthy Tomato Plant',
    ],
    labelToKey: {
      'Corn (Maize) with Cercospora and Gray Leaf Spot': 'maize_gray_leaf_spot',
      'Corn (Maize) with Common Rust': 'maize_common_rust',
      'Corn (Maize) with Northern Leaf Blight': 'maize_northern_leaf_blight',
      'Healthy Corn (Maize) Plant': 'maize_healthy',
      'Grape with Black Rot': 'grape_black_rot',
      'Grape with Esca (Black Measles)': 'grape_esca',
      'Grape with Isariopsis Leaf Spot': 'grape_isariopsis_leaf_spot',
      'Healthy Grape Plant': 'grape_healthy',
      'Potato with Early Blight': 'potato_early_blight',
      'Potato with Late Blight': 'potato_late_blight',
      'Healthy Potato Plant': 'potato_healthy',
      'Tomato with Bacterial Spot': 'tomato_bacterial_spot',
      'Tomato with Early Blight': 'tomato_early_blight',
      'Tomato with Late Blight': 'tomato_late_blight',
      'Tomato with Leaf Mold': 'tomato_leaf_mold',
      'Tomato with Septoria Leaf Spot': 'tomato_septoria_leaf_spot',
      'Tomato with Spider Mites or Two-spotted Spider Mite': 'tomato_spider_mites',
      'Tomato with Target Spot': 'tomato_target_spot',
      'Tomato Yellow Leaf Curl Virus': 'tomato_yellow_leaf_curl_virus',
      'Tomato Mosaic Virus': 'tomato_mosaic_virus',
      'Healthy Tomato Plant': 'tomato_healthy',
    },
    invalidLabels: [],
  },

  cropvit: {
    name: 'Crop Leaf Diseases ViT-tiny',
    repo: 'wambugu71/crop_leaf_diseases_vit_onnx',
    revision: '72c3499e00355c651b534bd5eb8b90f35f015da4',
    file: 'crop_leaf_diseases_vit.onnx',
    bytes: 22_301_835,
    license: 'MIT',
    input: 'pixel_values',
    // Exported with a non-standard output name; transformers.js expects "logits" and cannot load it.
    output: 'output',
    // From wambugu71/crop_leaf_diseases_vit preprocessor_config.json: plain resize, no crop.
    preprocess: { resize: 224, mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5] },
    labels: [
      'Corn___Common_Rust', 'Corn___Gray_Leaf_Spot', 'Corn___Healthy', 'Invalid', 'Potato___Early_Blight',
      'Potato___Healthy', 'Potato___Late_Blight', 'Rice___Brown_Spot', 'Rice___Healthy', 'Rice___Leaf_Blast',
      'Wheat___Brown_Rust', 'Wheat___Healthy', 'Wheat___Yellow_Rust',
    ],
    labelToKey: {
      Corn___Common_Rust: 'maize_common_rust',
      Corn___Gray_Leaf_Spot: 'maize_gray_leaf_spot',
      Corn___Healthy: 'maize_healthy',
      Potato___Early_Blight: 'potato_early_blight',
      Potato___Healthy: 'potato_healthy',
      Potato___Late_Blight: 'potato_late_blight',
      Rice___Brown_Spot: 'rice_brown_spot',
      Rice___Healthy: 'rice_healthy',
      Rice___Leaf_Blast: 'rice_leaf_blast',
      Wheat___Brown_Rust: 'wheat_brown_rust',
      Wheat___Healthy: 'wheat_healthy',
      Wheat___Yellow_Rust: 'wheat_yellow_rust',
    },
    invalidLabels: ['Invalid'],
  },

  newcrops: {
    name: 'KrishiScan Allium & Brassica MobileNetV3',
    // Trained for this project rather than downloaded: no public model covers onion, garlic or
    // the brassicas. Ships in the repo because it is 6 MB and there is nowhere to pin it to.
    localFile: 'weights/newcrops-v1.onnx',
    revision: 'newcrops-v1',
    bytes: 6_146_661,
    sha256: '150761fe922df64d85abb9575d61f405cc7743f52926e52d58baa51ada6a9af6',
    license: 'trained here; see README for the CC BY 4.0 source datasets',
    input: 'pixel_values',
    output: 'logits',
    // torchvision Resize(280) then CenterCrop(224), ImageNet normalisation - the transform the
    // model was validated with. Changing these silently degrades it.
    preprocess: {
      shortestEdge: 280,
      crop: 224,
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    },
    labels: [
      'broccoli_alternaria_leaf_spot', 'broccoli_black_rot', 'broccoli_healthy',
      'cabbage_alternaria_leaf_spot', 'cabbage_cabbage_butterfly', 'cabbage_grey_mould',
      'cabbage_healthy', 'cabbage_tip_burn', 'garlic_healthy', 'garlic_tipburn',
      'onion_healthy', 'onion_iris_yellow_spot_virus', 'onion_stemphylium_leaf_blight',
      'turnip_alternaria_leaf_spot', 'turnip_black_rot', 'turnip_healthy',
    ],
    // The classes were named as disease keys from the start, so the map is the identity.
    labelToKey: Object.fromEntries(
      [
        'broccoli_alternaria_leaf_spot', 'broccoli_black_rot', 'broccoli_healthy',
        'cabbage_alternaria_leaf_spot', 'cabbage_cabbage_butterfly', 'cabbage_grey_mould',
        'cabbage_healthy', 'cabbage_tip_burn', 'garlic_healthy', 'garlic_tipburn',
        'onion_healthy', 'onion_iris_yellow_spot_virus', 'onion_stemphylium_leaf_blight',
        'turnip_alternaria_leaf_spot', 'turnip_black_rot', 'turnip_healthy',
      ].map((k) => [k, k]),
    ),
    invalidLabels: [],
  },
};

/**
 * Which model(s) classify each crop; where two are listed, their probability distributions are
 * averaged. Measured on server/eval (see scripts/evaluate-models.js): routing maize through both
 * models took maize accuracy from 22% to 44%, because the PlantVillage model alone called every
 * common-rust photo grey leaf spot. The ViT does not have a northern-leaf-blight class, so maize
 * keeps the PlantVillage model too rather than switching to the ViT outright — averaging halves
 * that class's score, but dropping it would make the disease undiagnosable.
 */
export const CROP_ROUTES = {
  tomato: ['plantvillage'],
  grape: ['plantvillage'],
  maize: ['plantvillage', 'cropvit'],
  potato: ['plantvillage', 'cropvit'],
  rice: ['cropvit'],
  wheat: ['cropvit'],
  // The crops only the model trained here knows. Nothing is averaged in from the other two:
  // neither has ever seen an onion or a cabbage, so their opinion is noise.
  onion: ['newcrops'],
  garlic: ['newcrops'],
  cabbage: ['newcrops'],
  turnip: ['newcrops'],
  broccoli: ['newcrops'],
};

export const SUPPORTED_CROPS = Object.keys(CROP_ROUTES);

/**
 * Crops served by a single model that was trained on every one of them. For these, the model's
 * own probability mass is evidence about WHICH crop is in the photo, not just which disease:
 * onion, garlic and three brassicas were all in its training set, so a cabbage leaf declared as
 * onion makes the onion classes share out a small share of the probability.
 *
 * It cannot say anything useful about a tomato leaf, which it has never seen - but measured on
 * the project's own 63 evaluation photos of the six older crops, none of them reached the
 * threshold below, because the mass spreads across several crops instead of concentrating.
 */
export const SINGLE_MODEL_CROPS = Object.freeze(
  Object.entries(CROP_ROUTES)
    .filter(([, route]) => route.length === 1 && route[0] === 'newcrops')
    .map(([crop]) => crop),
);

/**
 * How much of the probability must sit on the declared crop's own classes before a diagnosis is
 * trusted. Swept through the real pipeline over 192 genuine new-crop photos and 175 impostor
 * attempts (a photo of one of the six older crops submitted as each new crop):
 *
 *   floor   keeps genuine   refuses impostors
 *   0.80        100.0%            95.4%
 *   0.85         99.5%            97.7%   <- chosen
 *   0.90         92.2%            98.9%
 *   0.95         75.0%           100.0%
 *
 * 0.85 rather than something stricter because this app treats refusing a real leaf as the
 * expensive mistake: the farmer gets nothing back and nothing to appeal. Buying 1.2 more points
 * of impostor rejection by turning away one real photo in thirteen is the wrong way round.
 * Re-run the sweep in scripts/evaluate-models.js whenever the model or the eval set changes.
 */
export const CROP_MATCH_FLOOR = 0.85;

/** Share of a distribution that sits on `crop`'s classes. Used to catch a mis-declared crop. */
export function cropProbability(predictions, crop) {
  let sum = 0;
  for (const { label, confidence } of predictions) {
    if (typeof label === 'string' && label.startsWith(`${crop}_`)) sum += confidence;
  }
  return sum;
}

/**
 * Other names a farmer may type or look for. "Corn" and "maize" are the same crop, and a farmer
 * who cannot find their crop in the list picks the wrong one, which the classifier then answers
 * confidently: a corn leaf declared as rice came back "rice leaf blast, 90%".
 * Keep in step with the `aliases` in seed/data/crops.json (seedLibrary checks this).
 */
export const CROP_ALIASES = {
  corn: 'maize',
  paddy: 'rice',
  // Names farmers actually type for the new crops.
  pyaz: 'onion',
  pyaaz: 'onion',
  kanda: 'onion',
  lahsun: 'garlic',
  lehsun: 'garlic',
  'patta gobhi': 'cabbage',
  bandgobhi: 'cabbage',
  shalgam: 'turnip',
  'hari gobhi': 'broccoli',
};

/** Canonical crop key for anything a client sends: trimmed, lowercased and de-aliased. */
export function resolveCrop(name) {
  const key = String(name ?? '').trim().toLowerCase();
  return CROP_ALIASES[key] ?? key;
}

/** Model whose invalid class screens every photo for "this is not a crop leaf at all". */
export const OOD_GATE_MODEL = 'cropvit';

/**
 * Crops the gate model was trained on. On any other crop its "invalid" score is a guess rather
 * than evidence: on the eval set a healthy tomato leaf scored 0.71 and a grape leaf 0.60, while
 * every genuine non-leaf photo scored at least 0.997. Only photos of these crops are held to the
 * lower "the gate is unsure" bar.
 */
export const GATE_MODEL_CROPS = Object.freeze([
  ...new Set(Object.values(MODELS[OOD_GATE_MODEL].labelToKey).map((key) => key.split('_')[0])),
]);

export function unifiedLabel(modelKey, rawLabel) {
  const model = MODELS[modelKey];
  if (model.invalidLabels.includes(rawLabel)) return INVALID_LABEL;
  return model.labelToKey[rawLabel] ?? `other:${modelKey}:${rawLabel}`;
}

export function modelVersion(modelKeys) {
  return modelKeys.map((k) => `${k}@${MODELS[k].revision.slice(0, 7)}`).join('+');
}
