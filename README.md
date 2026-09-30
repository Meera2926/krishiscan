# 🌱 KrishiScan - AI Crop Disease Diagnostic & Advisory Platform

[![Build Status](https://img.shields.io/badge/Build-Passing-brightgreen.svg)](https://github.com/Meera2926/krishiscan)
[![MERN Stack](https://img.shields.io/badge/Stack-MERN-green.svg)](https://react.dev)
[![ONNX Runtime](https://img.shields.io/badge/AI-ONNX_Web-blue.svg)](https://onnxruntime.ai)
[![Languages](https://img.shields.io/badge/Languages-Hindi%20%7C%20Tamil%20%7C%20Telugu%20%7C%20Malayalam%20%7C%20English-orange.svg)](#multilingual-support)

An AI-powered agricultural advisory platform designed for Indian smallholder farmers. Delivers offline-capable leaf disease diagnosis via ONNX neural inference, real-time meteorological fungal risk indices, verified ICAR treatment remedies, and APMC mandi market intelligence.

---

## 🌟 Key Features

- **📸 Instant AI Disease Identification**: MobileNetV3 model running directly in-browser using ONNX.js without server upload delays.
- **🌦️ Meteorological Disease Risk Index**: Predicts fungal blight and rust outbreaks using temperature and relative humidity telemetry.
- **🚜 Smart Spray Window Advisor**: Prevents chemical runoff by verifying wind speed and rainfall forecasts.
- **🗣️ Multilingual Voice Guidance**: Interactive vernacular text-to-speech in Hindi, Tamil, Telugu, Malayalam, and English.
- **🌾 APMC Mandi Market Intelligence**: Live price momentum, 7-day moving averages, and haulage cost calculations.
- **🧪 Organic vs Chemical Remedies**: Step-by-step ICAR-compliant biological control guides and pre-harvest interval (PHI) countdowns.

---

## 🚀 Getting Started

```bash
# 1. Clone repository
git clone https://github.com/Meera2926/krishiscan.git
cd krishiscan

# 2. Install dependencies
npm run install:all

# 3. Launch development servers
npm run dev
```

---

## 📚 Technical Documentation
- [Diagnosis Pipeline Architecture](docs/DIAGNOSIS_PIPELINE.md)
- [Weather Risk & Spray Models](docs/WEATHER_RISK_MODELS.md)
- [Mandi Market Analytics](docs/MANDI_ANALYTICS.md)

---

## 📄 License
This project is open-source under the MIT License.
