# 📖 Home Assistant Add-on Repository - Quick Reference

## ✅ Conversion Complete!

Your repository is now a **valid Home Assistant Add-on Repository**.

```
┌─ Repository URL for Home Assistant ──────────────────────────┐
│ https://github.com/Cartasid/GrowmindAI                       │
│                                                               │
│ In Home Assistant:                                            │
│ Settings → Add-ons → Add-on Store → Menu → Repositories      │
└───────────────────────────────────────────────────────────────┘
```

## 📁 Key Files (What Each Does)

| File | Purpose | Location |
|------|---------|----------|
| **addons.json** | Tells Home Assistant what add-ons are available | Root |
| **repository.json** | Repository metadata | Root |
| **growmind-ai/addon.yaml** | Add-on configuration (name, version, settings) | growmind-ai/ |
| **growmind-ai/Dockerfile** | Container image definition | growmind-ai/ |
| **growmind-ai/README.md** | Add-on documentation for users | growmind-ai/ |
| **ADDON_REPOSITORY_SETUP.md** | Complete setup guide for developers | Root |
| **ADDON_CONVERSION_SUMMARY.md** | What was changed in this conversion | Root |

## 🎯 What Was Created

### New Directories
```
growmind-ai/                    ← Add-on directory
├── addon.yaml                  ← Home Assistant configuration
├── Dockerfile                  ← Container image
└── README.md                   ← Add-on documentation
```

### New Files
```
addons.json                     ← Repository manifest
repository.json                 ← Repository metadata
ADDON_REPOSITORY_SETUP.md       ← Setup guide
ADDON_CONVERSION_SUMMARY.md     ← This conversion summary
```

## 🚀 Installation Quick Start

### For Users
1. Copy repository URL: `https://github.com/Cartasid/GrowmindAI`
2. In Home Assistant: Settings → Add-ons → Add-on Store → Menu → Repositories
3. Paste URL, click Create
4. Find "GrowMind AI" in the store and install

### For Docker/Development
```bash
cd growmind-ai
docker build --build-arg BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest -t growmind-ai .
```

## 📋 File Reference

### addons.json
```json
{
  "version": 1,
  "addons": [{
    "slug": "growmind-ai",
    "name": "GrowMind AI",
    "version": "0.1.0",
    ...
  }]
}
```

### addon.yaml
```yaml
name: GrowMind AI
slug: growmind-ai
version: "0.1.0"
description: Intelligent cannabis cultivation assistant
...
```

### Dockerfile
Entry point for Home Assistant to build the add-on image.
- Builds React frontend
- Sets up Python backend
- Configures FastAPI service

## ⚙️ Configuration Available to Users

When users install the add-on, they can configure:

| Setting | Type | Default |
|---------|------|---------|
| Gemini API Key | password | (required) |
| Gemini Model | text | gemini-2.5-flash |
| Log Level | dropdown | info |

## 🔄 Update Process

When you update the add-on:

1. **Update version** in `growmind-ai/addon.yaml`:
   ```yaml
   version: "0.2.0"
   ```

2. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Update GrowMind AI to v0.2.0"
   git push
   ```

3. **Home Assistant** automatically detects the update!

## 📞 Support Resources

- **Setup Guide**: [ADDON_REPOSITORY_SETUP.md](ADDON_REPOSITORY_SETUP.md)
- **Conversion Details**: [ADDON_CONVERSION_SUMMARY.md](ADDON_CONVERSION_SUMMARY.md)
- **Add-on Specific**: [growmind-ai/README.md](growmind-ai/README.md)
- **GitHub**: https://github.com/Cartasid/GrowmindAI

## ✨ Features Enabled

✅ Ingress (access via Home Assistant sidebar)
✅ Dashboard panel with custom icon
✅ Configuration UI
✅ Health monitoring
✅ WebSocket support
✅ File access (/share directory)
✅ Home Assistant API integration
✅ Auto-start on boot

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Repository not appearing | Clear cache, restart HA |
| Add-on won't install | Check Home Assistant version ≥ 2024.1 |
| Dashboard not accessible | Check add-on logs, verify API key |
| Services not starting | Review add-on logs for errors |

---

**Status**: ✅ Ready for Home Assistant Add-on Store  
**Created**: February 6, 2026
