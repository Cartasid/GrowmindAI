# GrowmindAI 🌱

**Intelligent cannabis cultivation assistant powered by Google Gemini AI**, integrated with Home Assistant. Monitor climate, lighting, and substrate sensors in real-time, generate AI-powered grow plans, track nutrient schedules, and maintain comprehensive growth journals.

## 🎯 Features

- **🌡️ Real-time Sensor Monitoring** - Climate, lighting, and substrate sensors via Home Assistant
- **🤖 AI-Powered Plans** - Gemini generates optimal nutrient schedules based on cultivar and substrate
- **📊 Nutrient Calculator** - PhotonFlux-integrated dosing system with PPM profiles
- **📓 Growth Journal** - Document every stage with AI analysis, photo uploads, and quality ratings
- **🎨 Modern Dashboard** - Real-time data visualization with Framer Motion animations
- **📈 Performance Tracking** - Track yield, quality, and cannabis profile metrics

## 🚀 Quick Start

### Requirements

- **Home Assistant** >= 2024.1
- **Google Gemini API Key** (https://ai.google.dev)
- Sensor entities configured in Home Assistant
- **Node.js** >= 20 (for frontend development)
- **Python** >= 3.11 (for backend development)

### Installation

1. **Add repository** to Home Assistant
2. **Install GrowmindAI add-on** from Add-on Store
3. **Configure your Gemini API key** in settings
4. **Access the dashboard** via Home Assistant left sidebar

## 🏗️ Architecture

```
Frontend (React) ──> Backend (FastAPI) ──> Home Assistant
   - Components         - Database            - Sensors
   - Hooks               - API Routes          - Services
   - Services            - WebSocket
```

## 📋 API Documentation

### Journal Endpoints
```
GET    /api/journal/{grow_id}              # List all entries
POST   /api/journal/{grow_id}              # Bulk save entries
POST   /api/journal/{grow_id}/entry        # Add single entry
DELETE /api/journal/{grow_id}/entry/{id}   # Delete entry
```

### Nutrient Endpoints
```
GET    /api/nutrients/plan                 # Get nutrient plan
POST   /api/nutrients/plan                 # Preview plan
POST   /api/nutrients/confirm              # Confirm mix
GET    /api/nutrients/inventory            # Check inventory
POST   /api/nutrients/inventory/consume    # Log consumption
```

### AI Endpoints
```
POST   /api/gemini/analyze-image           # Analyze plant images
POST   /api/gemini/analyze-text            # Text analysis
```

## 🛠️ Development

### Frontend Setup
```bash
cd frontend
npm install
npm run dev        # Start dev server on http://localhost:5173
npm run build      # Build for production
```

### Backend Setup
```bash
cd backend
pip install -e .
python -m uvicorn app.main:app --reload --port 8000
```

## 🧪 Testing

### Run Tests
```bash
cd backend
pytest tests/ -v --cov=app --cov-report=term-missing
```

### Security Scanning
```bash
pip install bandit safety
bandit -r backend/app/
safety check
npm audit
```

## 🔒 Security

✅ **Implemented:**
- Input validation & sanitization on all endpoints
- Credential redaction in logs
- Race condition fixes in async code
- Database transactions for data integrity
- Dependency pinning to known secure versions
- Error boundaries in frontend
- Secure WebSocket handling

📖 **See detailed security guidelines in [SECURITY_REPORT.md](SECURITY_REPORT.md)**

## 📊 Configuration

### Environment Variables

```bash
# Home Assistant
HASS_API_BASE=http://supervisor/core/api
SUPERVISOR_TOKEN=your_token_here

# Gemini API
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-2.5-flash

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_MAX_REQUESTS=120
RATE_LIMIT_WINDOW_SECONDS=60
```

## 🐛 Troubleshooting

### API Key Not Found
→ Configure GEMINI_API_KEY environment variable

### Cannot Connect to Home Assistant
→ Verify HASS_API_BASE and token are correct

### WebSocket Connection Failed
→ Check CORS settings and firewall rules

## 🔗 Documentation

- **[Code Review](CODE_REVIEW.md)** - Detailed analysis of issues
- **[Fixes Guide](FIXES_GUIDE.md)** - Implementation solutions  
- **[Security Report](SECURITY_REPORT.md)** - Security guidelines
- **[Executive Summary](EXECUTIVE_SUMMARY.md)** - Timeline & costs
- **[Review Index](REVIEW_INDEX.md)** - Quick navigation

## 📄 License

MIT License

---

**Last Updated:** February 6, 2026  
**Status:** ✅ Production Ready (After Phase 0-1)  
**Maintainer:** Cartasid
