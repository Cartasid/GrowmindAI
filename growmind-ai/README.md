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
