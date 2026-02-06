# 🔧 LÖSUNGSHANDBUCH - GrowmindAI Code Fixes

**Zielgruppe:** Development Team  
**Priorität:** SOFORT FÜR PRODUCTION  

---

## 🚨 FIX #1: Race Condition in `_hass()` Client

**Kritikalität:** 🔴 CRITICAL  
**Datei:** `backend/app/main.py` (Lines 209-224)  
**Time to Fix:** ~30 min  

### Problem
```python
# UNSICHER - Current Code
async def _hass() -> httpx.AsyncClient:
    global _hass_client
    if _hass_client is not None and not _hass_client.is_closed:  # ❌ Check WITHOUT lock
        return _hass_client
    async with _hass_lock:  # ❌ Lock NACH dem Check
        if _hass_client is None or _hass_client.is_closed:
            _hass_client = httpx.AsyncClient(...)
    return _hass_client
```

### Lösung
```python
async def _hass() -> httpx.AsyncClient:
    global _hass_client
    # CRITICAL FIX: Acquire lock FIRST
    async with _hass_lock:
        if _hass_client is None or _hass_client.is_closed:
            _hass_client = httpx.AsyncClient(
                base_url=HASS_API_BASE,
                timeout=httpx.Timeout(15.0),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            )
    return _hass_client
```

### Testcode
```python
# tests/test_threading.py
import asyncio
import pytest

@pytest.mark.asyncio
async def test_hass_client_no_double_creation():
    """Verify client is not created twice by concurrent calls"""
    from app.main import _hass, _hass_client, _hass_lock
    
    # Reset global
    global _hass_client
    _hass_client = None
    
    # 100 concurrent calls
    tasks = [_hass() for _ in range(100)]
    results = await asyncio.gather(*tasks)
    
    # All must return same instance
    client_ids = [id(r) for r in results]
    assert len(set(client_ids)) == 1, "Multiple client instances created!"
```

---

## 🔐 FIX #2: Token Leak in Logs

**Kritikalität:** 🔴 CRITICAL  
**Dateien:** `backend/app/main.py`, `backend/app/ai_routes.py`  
**Time to Fix:** ~1.5 hours  

### Problem
```python
# Current: Tokens können in verschiedenen Kontexten leaken
# 1. _hass_headers() wird ohne Filter geloggt
# 2. Exception Tracebacks zeigen API Keys
# 3. Request bodies werden geloggt (können Secrets enthalten)
```

### Lösung - Step 1: Enhanced Logging Filter

```python
# backend/app/logging_config.py (NEW FILE)
import logging
import re
from typing import Optional

class SecureLoggingFilter(logging.Filter):
    """Redacts all sensitive credentials from log records."""
    
    # Pattern für verschiedene Credential-Typen
    PATTERNS = {
        'bearer': re.compile(r'Bearer\s+[A-Za-z0-9_-]+'),
        'api_key': re.compile(r'(?:api[_-]?key|apikey)["\']?\s*[:=]\s*["\']?[^"\'\\s]+'),
        'auth': re.compile(r'[Aa]uthorization["\']?\s*[:=]\s*["\']?[^"\'\\s]+'),
        'token': re.compile(r'[Tt]oken["\']?\s*[:=]\s*["\']?[^"\'\\s]+'),
        'password': re.compile(r'[Pp]assword["\']?\s*[:=]\s*["\']?[^"\'\\s]+'),
        'secret': re.compile(r'[Ss]ecret["\']?\s*[:=]\s*["\']?[^"\'\\s]+'),
    }
    
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            # Redact message
            message = record.getMessage()
            redacted = self._redact(message)
            
            if redacted != message:
                record.msg = redacted
                record.args = ()
            
            # Redact exception info
            if record.exc_text:
                record.exc_text = self._redact(record.exc_text)
                
        except Exception:
            # Never let logging crash the app
            pass
        
        return True
    
    @staticmethod
    def _redact(text: str) -> str:
        """Apply all redaction patterns."""
        for pattern in SecureLoggingFilter.PATTERNS.values():
            text = pattern.sub('[REDACTED]', text)
        return text


def setup_secure_logging():
    """Configure all loggers with secure filter."""
    secure_filter = SecureLoggingFilter()
    
    # Apply to root logger
    root_logger = logging.getLogger()
    root_logger.addFilter(secure_filter)
    
    # Apply to all handlers
    for handler in root_logger.handlers:
        handler.addFilter(secure_filter)
```

### Lösung - Step 2: Update main.py

```python
# In backend/app/main.py, replace the old SensitiveValueFilter with:
from .logging_config import setup_secure_logging

# In lifespan function or startup:
def startup():
    setup_secure_logging()
    logger.info("Secure logging initialized")

# Remove old SensitiveValueFilter class entirely
```

### Lösung - Step 3: Exception Handling

```python
# backend/app/main.py - Update ALL exception handlers

@app.exception_handler(InvalidIdentifierError)
async def invalid_identifier_handler(request: Request, exc: InvalidIdentifierError):
    # Never log the exception with details
    logger.warning("Invalid identifier request")
    return JSONResponse({"detail": "Invalid input"}, status_code=400)

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    # Log error code, not details
    error_id = str(uuid.uuid4())
    logger.error(f"Unhandled exception [ID: {error_id}]", exc_info=False)
    # Give user error ID for support, not the details
    return JSONResponse({
        "detail": f"Internal server error. Reference: {error_id}",
        "errorId": error_id
    }, status_code=500)
```

### Test
```python
# tests/test_logging.py
def test_no_tokens_in_logs(caplog):
    """Verify tokens don't appear in logs"""
    import logging
    logger = logging.getLogger(__name__)
    
    secret_token = "super-secret-xyz-123"
    test_header = f"Authorization: Bearer {secret_token}"
    
    logger.info(f"Request: {test_header}")
    
    # Check logs don't contain secret
    assert secret_token not in caplog.text
    assert "[REDACTED]" in caplog.text
```

---

## ✓ FIX #3: Input Validation überall

**Kritikalität:** 🔴 CRITICAL  
**Dateien:** `backend/app/journal_routes.py`, `backend/app/plan_routes.py`  
**Time to Fix:** ~2 hours  

### Problem
```python
# journal_routes.py - Line 82+
def _journal_key(grow_id: str) -> str:
    return f"journal_{grow_id}"  # grow_id is user input, no validation!
```

### Solution

```python
# backend/app/journal_routes.py - Update ALL endpoints

from .database import _validate_identifier, InvalidIdentifierError

# Update the routes
@router.get("/entries/{grow_id}")
async def list_entries(grow_id: str) -> Dict[str, Any]:
    try:
        validated_grow_id = _validate_identifier(grow_id, "grow_id")
    except InvalidIdentifierError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    entries = _load_entries(validated_grow_id)
    return {"entries": entries}

@router.post("/entries")
async def create_entry(
    payload: JournalEntryPayload, 
    grow_id: str = Query(...)
) -> JournalEntryResponse:
    try:
        validated_grow_id = _validate_identifier(grow_id, "grow_id")
    except InvalidIdentifierError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # Validate payload
    if not payload.date:
        raise HTTPException(status_code=400, detail="date is required")
    
    # Validate metrics
    if payload.metrics:
        for field_name, value in payload.metrics.dict(exclude_none=True).items():
            if value is not None and not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=400, 
                    detail=f"metrics.{field_name} must be numeric"
                )
    
    # ... rest of implementation
```

### Auch updaten in plan_routes.py:

```python
from .database import _validate_identifier, InvalidIdentifierError

@router.get("/plans/{plan_id}")
async def get_plan(plan_id: str) -> Dict[str, Any]:
    try:
        valid_id = _validate_identifier(plan_id, "plan_id")
    except InvalidIdentifierError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    # ... load and return plan
```

---

## 🛡️ FIX #4: WebSocket Error Handling

**Kritikalität:** 🟡 HIGH  
**Datei:** `backend/app/main.py`  
**Time to Fix:** ~1 hour  

### Problem
WebSocket imports vorhanden aber keine Endpoints implementiert, WS_MAX_ERRORS nicht verwendet.

### Solution - Template für WebSocket Handler

```python
# backend/app/websocket_routes.py (NEW FILE)
import asyncio
import json
import logging
from typing import Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from contextlib import asynccontextmanager

router = APIRouter(prefix="/ws", tags=["websocket"])
logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self, max_errors: int = 6):
        self.active_connections: Set[WebSocket] = set()
        self.max_errors = max_errors
        self.error_counts: dict[WebSocket, int] = {}
    
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        self.error_counts[websocket] = 0
        logger.info(f"WebSocket connected. Total: {len(self.active_connections)}")
    
    async def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        self.error_counts.pop(websocket, None)
        logger.info(f"WebSocket disconnected. Total: {len(self.active_connections)}")
    
    async def record_error(self, websocket: WebSocket) -> bool:
        """Record error, return True if should disconnect"""
        self.error_counts[websocket] = self.error_counts.get(websocket, 0) + 1
        if self.error_counts[websocket] >= self.max_errors:
            return True
        return False
    
    async def broadcast(self, message: dict):
        """Send message to all connected clients"""
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send to client: {e}")
                disconnected.append(connection)
        
        for connection in disconnected:
            await self.disconnect(connection)

manager = ConnectionManager(max_errors=6)

@router.websocket("/api/live")
async def websocket_live_data(websocket: WebSocket):
    """Stream live sensor data"""
    await manager.connect(websocket)
    
    try:
        while True:
            # Receive client messages with timeout
            try:
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=30.0
                )
                # Handle client message
                logger.debug(f"WS message: {data}")
                
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
                
            except json.JSONDecodeError:
                if await manager.record_error(websocket):
                    logger.warning("WebSocket: max errors reached, closing")
                    await manager.disconnect(websocket)
                    break
                await websocket.send_json({
                    "error": "Invalid JSON",
                    "type": "error"
                })
            
            except Exception as e:
                if await manager.record_error(websocket):
                    logger.warning(f"WebSocket: max errors, closing {str(e)}")
                    await manager.disconnect(websocket)
                    break
                logger.error(f"WebSocket error: {e}")
    
    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket unexpected error: {e}")
        await manager.disconnect(websocket)

# In main.py, add:
from .websocket_routes import router as ws_router
app.include_router(ws_router)
```

---

## 🎯 FIX #5: Frontend Error Boundary

**Kritikalität:** 🟡 HIGH  
**Datei:** `frontend/src/main.tsx`  
**Time to Fix:** ~30 min  

### Solution

```tsx
// frontend/src/components/ErrorBoundary.tsx (NEW FILE)
import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Error boundary caught:", error, errorInfo);
    // Send to error tracking service
    // Sentry.captureException(error, { contexts: { react: errorInfo } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-900 to-red-700">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-white mb-4">
              ⚠️ Something went wrong
            </h1>
            <p className="text-red-100 mb-6">
              {this.state.error?.message || "An unexpected error occurred"}
            </p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-white text-red-700 rounded hover:bg-red-50"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

```tsx
// frontend/src/main.tsx - UPDATE
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
```

---

## 📦 FIX #6: Dependency Pinning

**Kritikalität:** 🟡 HIGH  
**Dateien:** `backend/pyproject.toml`, `frontend/package.json`  
**Time to Fix:** ~1 hour  

### Solution - Backend

```toml
# backend/pyproject.toml - REPLACE dependencies section
[project]
name = "cultivation-os-backend"
version = "0.1.0"
description = "FastAPI bridge between Cultivation OS frontend and Home Assistant"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.109.0,<0.110.0",        # Pinned to minor version
    "uvicorn[standard]>=0.27.0,<0.28.0",
    "httpx>=0.26.0,<0.27.0",
    "portalocker>=2.8.0,<3.0.0",
    "google-genai>=0.3.0,<0.4.0",       # CHANGED: CRITICAL!
    "python-dotenv>=1.0.0,<1.1.0",      # ADD: für .env support
    "pydantic>=2.0.0,<2.1.0"            # ADD: für validation
]
```

### Solution - Frontend

```json
// frontend/package.json - REPLACE devDependencies
{
  "name": "cultivation-os-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "dependencies": {
    "@radix-ui/react-slot": "2.0.2",
    "class-variance-authority": "0.7.0",
    "clsx": "2.1.0",
    "framer-motion": "10.18.0",
    "lucide-react": "0.320.0",
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "tailwind-merge": "2.2.1"
  },
  "devDependencies": {
    "@types/react": "18.2.45",
    "@types/react-dom": "18.2.18",
    "@vitejs/plugin-react": "4.2.1",
    "autoprefixer": "10.4.16",
    "postcss": "8.4.33",
    "tailwindcss": "3.4.1",
    "tailwindcss-animate": "1.0.7",
    "typescript": "5.3.3",
    "vite": "5.0.12"
  }
}
```

### Dann ausführen:
```bash
cd backend
pip install -e .

cd ../frontend
npm ci  # NOT npm install!
npm audit fix  # Check for vulnerabilities
```

---

## 💾 FIX #7: Database Transactions

**Kritikalität:** 🟡 HIGH  
**Datei:** `backend/app/database.py`  
**Time to Fix:** ~2 hours  

### Problem
```python
# Keine Transaction-Sicherheit für Multi-Step Operationen
# Z.B.: Inventory Update + Consumption muss ATOMIC sein
```

### Solution

```python
# backend/app/database.py - Add after GrowMindDB class definition

from contextlib import contextmanager

class GrowMindDB:
    # ... existing code ...
    
    @contextmanager
    def transaction(self):
        """Context manager for database transactions"""
        conn = self._get_connection()
        try:
            # Start transaction
            conn.execute("BEGIN IMMEDIATE")  # Exclusive lock
            yield conn
            conn.commit()
        except Exception as e:
            conn.rollback()
            logger.error(f"Transaction failed, rolled back: {e}")
            raise
        finally:
            conn.close()
    
    def consume_inventory(self, consumption: Dict[str, float]) -> None:
        """Update inventory - ATOMIC operation"""
        with self.transaction() as conn:
            inv = self._load_inventory_locked(conn)
            
            for component, quantity in consumption.items():
                if component not in inv:
                    inv[component] = {"grams": 0.0, "initial_grams": 0.0}
                
                current = inv[component].get("grams", 0.0)
                if current < quantity:
                    raise ValueError(f"Insufficient {component}: have {current}, need {quantity}")
                
                inv[component]["grams"] = current - quantity
                inv[component]["updated_at"] = datetime.now(timezone.utc).isoformat()
            
            # Write all updates in one transaction
            for component, data in inv.items():
                conn.execute("""
                    INSERT OR REPLACE INTO inventory (component, grams, initial_grams, updated_at)
                    VALUES (?, ?, ?, ?)
                """, (component, data["grams"], data["initial_grams"], data["updated_at"]))
    
    def _load_inventory_locked(self, conn: sqlite3.Connection) -> Dict[str, Dict[str, float]]:
        """Load inventory within a transaction (already has lock)"""
        cursor = conn.execute("SELECT component, grams, initial_grams, updated_at FROM inventory")
        return {
            row["component"]: {
                "grams": row["grams"],
                "initial_grams": row["initial_grams"],
                "updated_at": row["updated_at"]
            }
            for row in cursor.fetchall()
        }
```

---

## 🧪 FIX #8: Add Comprehensive Tests

**Kritikalität:** 🟡 HIGH  
**Dateien:** `backend/tests/`  
**Time to Fix:** ~8 hours  

### Solution - Test Template

```python
# backend/tests/test_database.py (NEW FILE)
import pytest
import sqlite3
from pathlib import Path
from app.database import GrowMindDB, InvalidIdentifierError

@pytest.fixture
def test_db(tmp_path):
    """Create isolated test database"""
    db_path = tmp_path / "test.db"
    import os
    os.environ["DATABASE_URL"] = str(db_path)
    db = GrowMindDB()
    yield db
    # Cleanup
    db_path.unlink(missing_ok=True)

def test_inventory_update_atomic(test_db):
    """Test that inventory updates are atomic"""
    # Setup
    test_db.set_setting("test_key", "test_value")
    
    # Execute
    with test_db.transaction():
        test_db.set_setting("test_key", "updated_value")
    
    # Verify
    assert test_db.get_setting("test_key") == "updated_value"

def test_invalid_identifier_rejected(test_db):
    """Test that invalid identifiers are rejected"""
    with pytest.raises(InvalidIdentifierError):
        test_db.get_collection("invalid@identifier")
    
    with pytest.raises(InvalidIdentifierError):
        test_db.get_collection("")
    
    with pytest.raises(InvalidIdentifierError):
        test_db.get_collection("a" * 200)  # Too long

def test_concurrent_writes_safe(test_db):
    """Test thread safety of concurrent writes"""
    import threading
    results = []
    
    def writer(value):
        try:
            test_db.set_setting("concurrent_key", value)
            results.append("success")
        except Exception as e:
            results.append(f"error: {e}")
    
    threads = [threading.Thread(target=writer, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    
    # Should all succeed
    assert all(r == "success" for r in results)
```

---

## 📚 FIX #9: Update README.md

**Kritikalität:** 🟡 MEDIUM  
**Datei:** `README.md`  
**Time to Fix:** ~1 hour  

```markdown
# GrowmindAI 🌱

Intelligent cannabis cultivation assistant for Home Assistant powered by Google Gemini AI.

## Features

- 🌡️ **Real-time Sensor Monitoring** - Climate, lighting, and substrate sensors
- 🤖 **AI-Powered Plans** - Gemini generates optimal nutrient schedules
- 📊 **Nutrient Calculator** - PhotonFlux-integrated dosing system
- 📓 **Growth Journal** - Document every stage with AI analysis
- 🎨 **Modern Dashboard** - Real-time data visualization

## Quick Start

### Requirements
- Home Assistant >= 2024.1
- Google Gemini API key
- Sensor mappings configured

### Installation

1. Add repository to Home Assistant
2. Install GrowmindAI add-on
3. Configure Gemini API key in settings
4. Map your sensors in configuration

### Configuration

```yaml
# Set environment variables:
GEMINI_API_KEY: "your-api-key"
GEMINI_MODEL: "gemini-2.5-flash"
HASS_API_BASE: "http://supervisor/core/api"
```

## Architecture

```
frontend/     - React + TypeScript UI
├── src/
│   ├── components/   - UI Components
│   ├── services/     - API Services
│   └── hooks/        - Custom Hooks
├── package.json
└── vite.config.ts

backend/      - FastAPI Server
├── app/
│   ├── main.py       - FastAPI app setup
│   ├── database.py    - SQLite DB layer
│   ├── airotues.py   - Gemini Integration
│   └── routes/       - API Endpoints
├── pyproject.toml
└── nutrient_engine.py - Nutrient Calculator
```

## API Documentation

### Journal Endpoints
- `GET /api/journal/entries/{grow_id}` - List entries
- `POST /api/journal/entries` - Create entry
- `PUT /api/journal/entries/{id}` - Update entry

### Nutrient Endpoints
- `GET /api/nutrients/plan` - Preview nutrient plan
- `POST /api/nutrients/confirm` - Mix tank

### AI Endpoints
- `POST /api/gemini/analyze-image` - Analyze plant images
- `POST /api/gemini/analyze-text` - Text analysis

## Development

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
pip install -e .
python -m uvicorn app.main:app --reload
```

## Testing

```bash
pytest backend/tests/ -v --cov=app
npm run test  # Frontend tests
```

## Security

- ✅ Sensitive data redaction in logs
- ✅ Input validation on all endpoints
- ✅ Pinned dependencies
- ✅ Database transaction support
- ✅ Rate limiting enabled

**See [CODE_REVIEW.md](CODE_REVIEW.md) for security findings**

## Troubleshooting

### API Key Error
→ Set GEMINI_API_KEY env var

### Sensor Data Not Showing
→ Check Home Assistant entity mappings in mapping.json

### Database Locked
→ Restart add-on, check for long-running operations

## Contributing

1. Fork repository
2. Create feature branch
3. Add tests
4. Submit pull request

## License

MIT License - See LICENSE file

## Support

- 📖 [Documentation](https://docs.growmind.ai)
- 🐛 [Report Issues](https://github.com/Cartasid/GrowmindAI/issues)
- 💬 [Discussions](https://github.com/Cartasid/GrowmindAI/discussions)
```

---

## ✅ IMPLEMENTATION CHECKLIST

```
FIX #1: Race Condition in _hass()
- [ ] Update _hass() function with lock-first pattern
- [ ] Test with 100 concurrent calls
- [ ] Verify no memory leaks

FIX #2: Token Leak Prevention
- [ ] Create logging_config.py with SecureLoggingFilter
- [ ] Update all exception handlers
- [ ] Test that tokens don't appear in logs
- [ ] Review all logger.error() calls

FIX #3: Input Validation
- [ ] Add validation to all journal endpoints
- [ ] Add validation to all plan endpoints
- [ ] Add validation to nutrient endpoints
- [ ] Create unit tests for invalid inputs

FIX #4: WebSocket Cleanup
- [ ] Create websocket_routes.py
- [ ] Implement ConnectionManager
- [ ] Test error counting
- [ ] Test disconnect cleanup

FIX #5: Error Boundary
- [ ] Create ErrorBoundary.tsx
- [ ] Update main.tsx
- [ ] Test error handling
- [ ] Add error logging

FIX #6: Dependency Pinning
- [ ] Update pyproject.toml
- [ ] Update package.json
- [ ] Run npm audit
- [ ] Run pip audit

FIX #7: Database Transactions
- [ ] Add transaction() context manager
- [ ] Add consume_inventory() method
- [ ] Test atomicity
- [ ] Update all multi-step operations

FIX #8: Unit Tests
- [ ] Create test_database.py
- [ ] Create test_journal_routes.py
- [ ] Create test_nutrition_engine.py
- [ ] Achieve 70%+ coverage

FIX #9: Documentation
- [ ] Update README.md
- [ ] Create API.md
- [ ] Create DEPLOYMENT.md
- [ ] Create TROUBLESHOOTING.md
```

---

**Status:** Ready for Implementation  
**Total Time:** ~18 hours for all Phase 1 fixes  
**Priority:** 🔴 MUST complete before production

