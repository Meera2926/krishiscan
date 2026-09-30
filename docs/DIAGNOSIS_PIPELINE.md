# KrishiScan AI Crop Disease Diagnosis Pipeline

## Architecture Overview
The diagnosis pipeline processes photographs of affected crop leaves through an on-device ONNX runtime neural classifier, cross-referencing meteorological signals and verified agricultural remedies.

```mermaid
graph TD
    LeafPhoto[Farmer Leaf Photo] --> AspectCheck[Aspect Ratio & Glare Filter]
    AspectCheck --> OnnxModel[MobileNetV3 ONNX Runtime]
    OnnxModel --> ConfidenceCheck{Confidence > 75%?}
    ConfidenceCheck -->|Yes| KnowledgeBase[ICAR Verified Treatment KB]
    ConfidenceCheck -->|No| ExpertDesk[Human Agronomist Review Queue]
    KnowledgeBase --> WeatherRisk[Fungal & Weather Risk Matrix]
    WeatherRisk --> VoiceOutput[Multilingual Regional Voice Guidance]
```
