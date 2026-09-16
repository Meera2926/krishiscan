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
};

/**
 * Which model(s) classify each crop. When two models share a crop's full class set their
 * probability distributions are averaged.
 */
export const CROP_ROUTES = {
  tomato: ['plantvillage'],
  grape: ['plantvillage'],
  maize: ['plantvillage'],
  potato: ['plantvillage', 'cropvit'],
  rice: ['cropvit'],
  wheat: ['cropvit'],
};

export const SUPPORTED_CROPS = Object.keys(CROP_ROUTES);

/** Model whose invalid class screens every photo for "this is not a crop leaf at all". */
export const OOD_GATE_MODEL = 'cropvit';

export function unifiedLabel(modelKey, rawLabel) {
  const model = MODELS[modelKey];
  if (model.invalidLabels.includes(rawLabel)) return INVALID_LABEL;
  return model.labelToKey[rawLabel] ?? `other:${modelKey}:${rawLabel}`;
}

export function modelVersion(modelKeys) {
  return modelKeys.map((k) => `${k}@${MODELS[k].revision.slice(0, 7)}`).join('+');
}
