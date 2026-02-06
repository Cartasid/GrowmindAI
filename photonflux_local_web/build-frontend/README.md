<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1QrCGVp9P7qU9RJ0WArKzeZ-UK8P9AL0j

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Journal metrics visualization

The grow journal now renders trend charts for the recorded metrics so you can spot changes at a glance:

- Plant height (cm)
- Temperature (°C)
- Relative humidity (%)
- Electrical conductivity (EC)
- pH trend

Toggle individual series in the journal modal to focus on the measurements that matter for your grow.
