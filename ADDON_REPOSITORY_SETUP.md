# Home Assistant Add-on Repository Setup Guide

## Overview

This repository is now properly configured as a **Home Assistant Add-on Repository**. You can add it directly to your Home Assistant instance and install GrowMind AI from the Add-on Store.

## Repository Structure

```
GrowmindAI/
├── addons.json                 # Lists all add-ons in this repository
├── repository.json             # Repository metadata
├── growmind-ai/                # Add-on directory
│   ├── addon.yaml              # Add-on configuration (Home Assistant standard)
│   ├── Dockerfile              # Container image definition
│   ├── README.md               # Add-on documentation
│   ├── build-context/          # Build files (frontend, backend, rootfs, etc.)
│   │   ├── frontend/
│   │   ├── backend/
│   │   ├── rootfs/
│   │   ├── mapping.json
│   │   └── config.yaml
│   └── ... other add-on files
├── frontend/                   # Frontend source (referenced in Dockerfile)
├── backend/                    # Backend source (referenced in Dockerfile)
├── rootfs/                     # Runtime configuration
└── ... other root files
```

## Adding to Home Assistant

### Method 1: Using Home Assistant Web UI

1. Open Home Assistant and navigate to **Settings** → **Add-ons** → **Add-on Store**
2. Click the menu icon (⋮) in the top-right corner
3. Select **Repositories**
4. Add the repository URL:
   ```
   https://github.com/Cartasid/GrowmindAI
   ```
5. Click **Create**
6. Navigate to the Add-on Store and search for **GrowMind AI**
7. Click on it and select **Install**

### Method 2: Direct URL (Advanced)

You can also use the direct add-on installation URL:
```
homeassistant://add-repository-and-install-addon/url/https%3A%2F%2Fgithub.com%2FCartasid%2FGrowmindAI/slug/growmind-ai
```

## Configuration

After installation, configure the add-on:

1. Under the **Configuration** tab, enter your **Gemini API Key**
2. Optionally adjust:
   - Log Level (debug, info, warning, error)
   - Gemini Model (default: gemini-2.5-flash)
3. Click **Save**
4. Start the add-on

## Accessing the Dashboard

Once running, access GrowMind AI:
- From the Home Assistant sidebar (GrowMind AI button)
- Or directly at: `http://[YOUR_HOME_ASSISTANT_IP]:8080`

## Files Overview

### addons.json
Defines the add-ons available in this repository:
```json
{
  "version": 1,
  "addons": [
    {
      "name": "GrowMind AI",
      "slug": "growmind-ai",
      "repository": "https://github.com/Cartasid/GrowmindAI",
      ...
    }
  ]
}
```

### repository.json
Contains repository metadata:
```json
{
  "name": "GrowMind AI Repository",
  "url": "https://github.com/Cartasid/GrowmindAI",
  "maintainer": "Cartasid"
}
```

### addon.yaml
Home Assistant add-on configuration (standard format):
```yaml
name: GrowMind AI
slug: growmind-ai
version: "0.1.0"
description: Intelligent cannabis cultivation assistant
arch:
  - aarch64
  - amd64
...
```

## Building the Add-on (For Developers)

### Local Build with Home Assistant Developer Mode

1. Place this repository in your `custom_addons/` directory:
   ```bash
   git clone https://github.com/Cartasid/GrowmindAI custom_addons/growmind-ai
   ```

2. In Home Assistant, navigate to **Settings** → **Add-ons** → **Add-on Store** → Menu → **Advanced Options**
3. Enable "Advanced Mode"
4. Navigate to **Create Addon** and select your local directory

### Manual Docker Build

```bash
cd growmind-ai
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest -t growmind-ai:latest .
docker run -p 8080:8080 growmind-ai:latest
```

## Troubleshooting

### Repository Not Appearing
- Ensure the URL is exactly: `https://github.com/Cartasid/GrowmindAI`
- Clear Home Assistant browser cache (Ctrl+Shift+Delete)
- Restart Home Assistant

### Add-on Won't Start
- Check the add-on logs in Home Assistant UI
- Ensure Gemini API Key is configured
- Verify Home Assistant can reach internet for API calls

### Can't Access Dashboard
- Verify add-on is running (check logs)
- Try accessing via the Ingress button in Home Assistant sidebar
- Check firewall/network settings

## Technical Details

- **Language**: Python (FastAPI) + TypeScript (React)
- **Architecture**: ARM64 (aarch64), AMD64 (amd64)
- **Requirements**: Node.js 20+ (for build), Python 3.11+
- **Base Image**: Home Assistant base image (Alpine Linux)

## Maintenance

### Version Updates

Edit `growmind-ai/addon.yaml`:
```yaml
version: "0.2.0"  # Update version
```

### Changelog

Maintain changelog in `growmind-ai/CHANGELOG.md` following this format:
```
## [0.2.0] - 2026-02-10
- Added feature X
- Fixed bug Y
```

## Support

For issues and documentation:
- GitHub Issues: https://github.com/Cartasid/GrowmindAI/issues
- GitHub Discussions: https://github.com/Cartasid/GrowmindAI/discussions
- Home Assistant Community: https://community.home-assistant.io

---

**Last Updated:** February 6, 2026
**Status:** ✅ Valid Home Assistant Add-on Repository
