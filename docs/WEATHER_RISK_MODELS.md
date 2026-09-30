# Meteorological Crop Stress & Disease Proliferation Models

## 1. Fungal Spore Germination Index
The model correlates temperature $T$ and relative humidity $RH$:
$$Risk = w_{rh} \cdot I(RH > 80) + w_t \cdot I(20 \le T \le 30) + w_r \cdot RainDays$$

## 2. Chemical Spray Windows
- **Wind Speed**: Must not exceed $15 \text{ km/h}$ to prevent spray drift.
- **Precipitation**: Rain probability must be $< 30\%$ within 6 hours of application.
