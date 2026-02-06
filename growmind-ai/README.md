# GrowMind AI Add-on for Home Assistant

**Intelligent cannabis cultivation assistant powered by Google Gemini AI**

## About

GrowMind AI is an intelligent assistant for cannabis cultivation that integrates seamlessly with Home Assistant. It monitors environmental conditions in real-time and provides AI-powered recommendations for optimal growing conditions.

## Features

- 🌡️ **Real-time Sensor Monitoring** - Climate, lighting, and substrate sensors via Home Assistant
- 🤖 **AI-Powered Plans** - Gemini generates optimal nutrient schedules based on cultivar and substrate
- 📊 **Nutrient Calculator** - PhotonFlux-integrated dosing system with PPM profiles
- 📓 **Growth Journal** - Document every stage with AI analysis, photo uploads, and quality ratings
- 🎨 **Modern Dashboard** - Real-time data visualization with Framer Motion animations
- 📈 **Performance Tracking** - Track yield, quality, and cannabis profile metrics

## Requirements

- Home Assistant >= 2024.1
- Google Gemini API Key (https://ai.google.dev)
- Sensor entities configured in Home Assistant

## Installation

1. Add this repository to Home Assistant:
   - Go to Settings → Add-ons → Add-on Store
   - Click the menu (⋮) → Repositories
   - Add: `https://github.com/Cartasid/GrowmindAI`

2. Install the GrowmindAI add-on from the Add-on Store

3. Configure your Gemini API Key in the add-on settings

4. Start the add-on and access the dashboard from the Home Assistant sidebar

## Configuration

### Required
- **Gemini API Key**: Your Google Gemini API key from https://ai.google.dev

### Optional
- **Log Level**: debug, info, warning, error (default: info)
- **Gemini Model**: Model to use for AI analysis (default: gemini-2.5-flash)
- **HASS Token**: Optional Home Assistant long-lived access token (fallback for API auth if Supervisor token is unavailable)
- **Water Profile Presets**: Optional JSON list to override water profile presets for plan optimizer
- **Water Profile Base**: Optional JSON object to override the default base profile used by presets

Example `water_profile_presets` value:

```json
[
   {
      "id": "coco_default",
      "label": "Coco Default",
      "substrate": "coco",
      "osmosisShare": 0.4,
      "waterProfile": {"Ca": 65.8, "Mg": 31.8, "K": 1.8}
   },
   {
      "id": "ro80",
      "label": "RO Mix 80%",
      "substrate": "all",
      "osmosisShare": 0.8
   }
]
```

Example `water_profile_base` value:

```json
{
   "N": 0.05,
   "Ca": 70.0,
   "Mg": 35.0,
   "K": 2.0,
   "Na": 8.0,
   "Cl": 18.0,
   "S": 72.0,
   "Fe": 0.02,
   "Mn": 0.02,
   "B": 0.02,
   "Mo": 0.01,
   "Zn": 0.02,
   "Cu": 0.01,
   "P": 0.0
}
```

## Usage

Access the GrowMind AI dashboard from your Home Assistant sidebar. The dashboard provides:
- Real-time climate monitoring
- AI-powered grow plan suggestions
- Nutrient schedule tracking
- Growth journal with photo uploads
- Performance analytics

## Support

For issues, feature requests, or documentation, visit: https://github.com/Cartasid/GrowmindAI

## License

MIT License
