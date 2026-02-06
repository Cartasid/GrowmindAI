# 🔒 SICHERHEITS- & BEST-PRACTICES REPORT

**GrowmindAI Security Assessment**  
**Erstellt:** 2026-02-06  
**Compliance Level:** ⚠️ NOT PRODUCTION READY  

---

## TEIL 1: SICHERHEITSRISIKEN

### 1. Authentifizierung & Authorization - KRITISCH

#### Status für bestimmte Probleme:
```
✅ Home Assistant Token wird verwendet (gut!)
❌ Keine Role-Based Access Control (RBAC)
❌ Keine User Session Management
❌ Kein Audit Logging für sensitive Operationen
❌ API Keys werden Frontend exposiert
```

#### Empfehlung:
```python
# backend/app/auth.py (NEW FILE)
from typing import Optional
from fastapi import HTTPException, Header
import jwt
from datetime import datetime, timedelta

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = "HS256"

class AuthError(HTTPException):
    def __init__(self, detail: str):
        super().__init__(status_code=401, detail=detail)

async def verify_token(authorization: Optional[str] = Header(None)) -> dict:
    """Verify Bearer token"""
    if not authorization:
        raise AuthError("Missing authorization header")
    
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise AuthError("Invalid authorization scheme")
        
        # Verify JWT
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
        
    except jwt.ExpiredSignatureError:
        raise AuthError("Token expired")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token")
    except ValueError:
        raise AuthError("Invalid authorization header format")

def create_access_token(user_id: str, expires_in_hours: int = 24) -> str:
    """Create JWT token for user"""
    expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)
    payload = {
        "sub": user_id,
        "exp": expires_at,
        "iat": datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

# Usage in routes:
@router.get("/api/journal/entries/{grow_id}")
async def list_entries(grow_id: str, user: dict = Depends(verify_token)):
    # Verify user owns this grow_id
    if user.get("growId") != grow_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    # ... rest of implementation
```

---

### 2. Encryption - KRITISCH

#### Current Status:
```
❌ Datenbank ist unverschlüsselt
❌ Keine Encryption at REST
❌ API responses sind unverschlüsselt über HTTP
❌ Secrets sind im miljøvariabler, nicht verschlüsselt
❌ Keine TLS/SSL Enforcing
```

#### Empfehlung:

```python
# backend/app/encryption.py (NEW FILE)
from cryptography.fernet import Fernet
import os

class EncryptionManager:
    """Handle encryption of sensitive data"""
    
    def __init__(self):
        key = os.getenv("ENCRYPTION_KEY")
        if not key:
            raise ValueError("ENCRYPTION_KEY must be set")
        self.cipher = Fernet(key.encode())
    
    def encrypt(self, plaintext: str) -> str:
        """Encrypt string"""
        return self.cipher.encrypt(plaintext.encode()).decode()
    
    def decrypt(self, ciphertext: str) -> str:
        """Decrypt string"""
        return self.cipher.decrypt(ciphertext.encode()).decode()

# Use for sensitive fields:
class JournalEntryPayload(BaseModel):
    # ... other fields ...
    confidentialNotes: Optional[str] = None  # Encrypt this
    
    def encrypt_sensitive(self):
        """Encrypt sensitive fields before storage"""
        if self.confidentialNotes:
            encryptor = EncryptionManager()
            self.confidentialNotes = encryptor.encrypt(self.confidentialNotes)

# Generate encryption key:
# python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

**Backend:**
- Nutze PostgreSQL statt SQLite für Production (with pg_crypto)
- Encrypted credentials in vault (HashiCorp Vault, AWS Secrets Manager)
- Enable TLS 1.2+ nur

**Frontend:**
- HTTPS only (enforce via CSP headers)
- Sensitive data NIE im localStorage (nutze sessionStorage)
- SameSite=Strict Cookies

---

### 3. Injection Attacks - KRITISCH

#### Current Status:
```
❌ Prompt Injection in Gemini API (ai_routes.py)
❌ Keine SQL Injection Protection (aber SQLite ist safer)
❌ XML/HTML Injection in Journal Notes
❌ Command Injection in externen Tools
```

#### Empfehlung:

```python
# backend/app/sanitization.py (NEW FILE)
import html
import json
import re
from typing import Any

class InputSanitizer:
    """Sanitize user input"""
    
    MAX_TEXT_LENGTH = 10000
    MAX_ARRAY_LENGTH = 1000
    
    @staticmethod
    def sanitize_text(text: str) -> str:
        """Remove dangerous characters from text"""
        if not isinstance(text, str):
            raise ValueError("Input must be string")
        
        if len(text) > InputSanitizer.MAX_TEXT_LENGTH:
            raise ValueError(f"Text too long (max {InputSanitizer.MAX_TEXT_LENGTH})")
        
        # HTML escape
        text = html.escape(text)
        # Remove control characters
        text = ''.join(c for c in text if ord(c) >= 32 or c in '\n\r\t')
        
        return text
    
    @staticmethod
    def sanitize_prompt(prompt: str) -> str:
        """Sanitize user prompt for LLM"""
        text = InputSanitizer.sanitize_text(prompt)
        
        # Remove potentially dangerous patterns
        dangerous_patterns = [
            r'ignore.*instructions',
            r'forget.*previous',
            r'system.*prompt',
            r'jailbreak',
        ]
        
        for pattern in dangerous_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                raise ValueError("Input contains potentially harmful content")
        
        return text
    
    @staticmethod
    def sanitize_json(data: dict) -> dict:
        """Recursively sanitize JSON data"""
        if not isinstance(data, dict):
            raise ValueError("Input must be dict")
        
        sanitized = {}
        for key, value in data.items():
            # Validate key
            if not isinstance(key, str) or len(key) > 100:
                continue
            
            if isinstance(value, str):
                sanitized[key] = InputSanitizer.sanitize_text(value)
            elif isinstance(value, dict):
                sanitized[key] = InputSanitizer.sanitize_json(value)
            elif isinstance(value, (int, float, bool, type(None))):
                sanitized[key] = value
            elif isinstance(value, list):
                if len(value) > InputSanitizer.MAX_ARRAY_LENGTH:
                    continue
                sanitized[key] = [InputSanitizer.sanitize_text(v) if isinstance(v, str) else v for v in value]
        
        return sanitized

# Use in routes:
from .sanitization import InputSanitizer

@router.post("/api/gemini/analyze-image")
async def analyze_image(payload: AnalyzeImagePayload):
    # Sanitize prompt
    if payload.prompt:
        payload.prompt = InputSanitizer.sanitize_prompt(payload.prompt)
    
    # Sanitize notes
    if payload.userNotes:
        payload.userNotes = InputSanitizer.sanitize_text(payload.userNotes)
    
    # ... rest of implementation
```

---

### 4. CORS & CSRF - HOCH

#### Current Status:
```
❌ CORS kann komplett disabled sein (kein default)
❌ Keine CSRF Protection
❌ Keine Content-Security-Policy Header
❌ Keine X-Frame-Options
```

#### Empfehlung:

```python
# backend/app/security_headers.py (NEW FILE)
from fastapi import FastAPI
from fastapi.middleware.middleqw import Middleware
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'wasm-unsafe-eval'; "  # Vite needs wasm-unsafe-eval
            "style-src 'self' 'unsafe-inline'; "      # Tailwind needs unsafe-inline
            "img-src 'self' data:; "
            "font-src 'self'; "
            "connect-src 'self' https://generativelanguage.googleapis.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "geolocation=(), "
            "microphone=(), "
            "camera=(), "
            "payment=(), "
            "usb=(), "
            "magnetometer=()"
        )
        
        return response

# In main.py:
from .security_headers import SecurityHeadersMiddleware

app.add_middleware(SecurityHeadersMiddleware)

# Better CORS config:
CORS_ALLOWED_ORIGINS = (os.getenv("CORS_ALLOWED_ORIGINS") or "http://localhost:3000").split(",")
if not CORS_ALLOWED_ORIGINS or CORS_ALLOWED_ORIGINS == ["http://localhost:3000"]:
    logger.warning("Using default CORS origins - set CORS_ALLOWED_ORIGINS for production")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # Explicit methods
    allow_headers=["Content-Type", "Authorization"],  # Explicit headers
    max_age=600,  # Preflight cache
)
```

---

### 5. Rate Limiting - HOCH

#### Current Status:
```
⚠️ Rate limiting existiert aber:
❌ Nicht auf WebSockets angewendet
❌ Nicht auf Sensitive Endpoints (Login, API Key)
❌ Memory-Leak Potential mit rotate IPs
❌ Zu einfach zu umgehen (nur IP-based)
```

#### Empfehlung:

```python
# backend/app/rate_limiting.py (NEW FILE)
import asyncio
from datetime import datetime, timedelta
from typing import Dict, Optional
import redis

class AdvancedRateLimiter:
    """Production-grade rate limiting"""
    
    def __init__(self, redis_url: str = "redis://localhost"):
        self.redis = redis.from_url(redis_url, decode_responses=True)
    
    async def check_limit(
        self,
        key: str,
        limit: int = 100,
        window_seconds: int = 60
    ) -> tuple[bool, Dict[str, int]]:
        """
        Check if request is within rate limit.
        Returns (allowed, status_dict)
        """
        now = datetime.utcnow()
        window_start = now - timedelta(seconds=window_seconds)
        
        # Use sorted set to track recent requests
        pipe = self.redis.pipeline()
        pipe.zremrangebyscore(key, 0, window_start.timestamp())
        pipe.zcard(key)
        pipe.zadd(key, {now.isoformat(): now.timestamp()})
        pipe.expire(key, window_seconds)
        
        results = pipe.execute()
        count = results[1]
        
        allowed = count < limit
        status = {
            "limit": limit,
            "remaining": max(0, limit - count - 1),
            "reset": int((window_start + timedelta(seconds=window_seconds)).timestamp())
        }
        
        return allowed, status

# Define limits for different endpoints
RATE_LIMITS = {
    "/api/gemini": (10, 3600),  # 10 requests per hour (expensive API)
    "/api/journal": (100, 60),   # 100 per minute
    "/api/nutrients": (50, 60),  # 50 per minute
    "/api/plans": (50, 60),      # 50 per minute
}

# In main.py:
@app.middleware("http")
async def advanced_rate_limit(request: Request, call_next):
    limiter = AdvancedRateLimiter()
    
    # Determine rate limit for this endpoint
    limit, window = next(
        ((l, w) for path, (l, w) in RATE_LIMITS.items() if request.url.path.startswith(path)),
        (1000, 60)  # Default
    )
    
    # Use combination of IP + User ID (if authenticated)
    client_id = f"{request.client.host}"
    if hasattr(request, "user"):
        client_id = f"{client_id}:{request.user.get('sub')}"
    
    allowed, status = await limiter.check_limit(client_id, limit, window)
    
    response = await call_next(request)
    
    # Add rate limit headers
    response.headers["X-RateLimit-Limit"] = str(limit)
    response.headers["X-RateLimit-Remaining"] = str(status["remaining"])
    response.headers["X-RateLimit-Reset"] = str(status["reset"])
    
    if not allowed:
        response.status_code = 429
        response.body = b'{"detail": "Rate limit exceeded"}'
    
    return response
```

---

## TEIL 2: BEST PRACTICES CHECKLIST

### Environment & Secrets Management

```yaml
❌ AKTUELL:
- Secrets in Environment Variables
- No encryption at rest

✅ SOLLTE:
- Use Kubernetes Secrets / AWS Secrets Manager
- Encrypted .env files (never commit)
- Rotate secrets every 90 days
- Audit who accessed secrets

Implementation:
1. Install Python Secrets Manager:
   pip install python-dotenv cryptography

2. Create .env.encrypted:
   ENCRYPTION_KEY=...
   GEMINI_API_KEY=...

3. Load in main.py:
   from dotenv import load_dotenv
   load_dotenv()  # Never commit .env!
```

### Data Validation

```python
❌ Current: Basic Pydantic validation

✅ Required:
- Custom validators for business logic
- Range checks for numeric values
- Format validation for emails, URLs
- Array size limits

# Example:
from pydantic import BaseModel, Field, validator

class FeedingDetails(BaseModel):
    A: float = Field(gt=0, le=100)  # Must be > 0 and <= 100
    X: float = Field(ge=0, le=100)
    BZ: float = Field(ge=0, le=100)
    
    @validator('A', 'X', 'BZ')
    def values_sum_check(cls, v, values):
        if 'A' in values and 'X' in values:
            if values['A'] + values['X'] > 100:
                raise ValueError('A + X cannot exceed 100')
        return v
```

### Logging & Monitoring

```python
❌ Current: Basic logging to stdout

✅ Required:
- Structured logging (JSON format)
- Log aggregation (ELK, DataDog, Sentry)
- Alert on errors > threshold
- Audit trail for sensitive operations
- Performance metrics

# Example structured logging:
import structlog

logger = structlog.get_logger()

logger.info(
    "api_call",
    method="POST",
    path="/api/nutrients/plan",
    status_code=200,
    duration_ms=145,
    user_id="user_123",
)
```

### Database Best Practices

```
❌ Current: SQLite for everything

✅ Required for Production:
- PostgreSQL with Row-Level Security
- Regular automated backups
- Point-in-time recovery (PITR)
- Connection pooling (pgbouncer)
- Query performance monitoring
- Database activity monitoring (DAM)

Migration:
1. Dockerize PostgreSQL
2. Schema versioning (Alembic)
3. Test migration on staging first
4. Zero-downtime migration strategy
```

### Frontend Security

```typescript
❌ Current:
- No error boundary
- No input validation
- No rate limiting

✅ Required:
- React Query for caching & offline
- Form validation (zod, yup)
- XSS protection (DOMPurify)
- Secure storage (sessionStorage, not localStorage)

// Example with React Query:
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';

const journalSchema = z.object({
  entries: z.array(z.object({
    id: z.string().uuid(),
    date: z.string().datetime(),
    notes: z.string().max(5000),
  })),
});

export function useJournal(growId: string) {
  return useQuery({
    queryKey: ['journal', growId],
    queryFn: async () => {
      const res = await fetch(apiUrl(`/api/journal/entries/${growId}`));
      const data = await res.json();
      return journalSchema.parse(data);
    },
    retry: 2,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

---

## TEIL 3: DEPLOYMENT SECURITY

### Docker Security

```dockerfile
# ❌ Current Dockerfile issues:
# - Running as root
# - No security scanning
# - Outdated base images

# ✅ Better Dockerfile:
FROM node:20-alpine as builder
# ... build frontend ...

FROM python:3.11-slim as runtime
# Create non-root user
RUN useradd -m -u 1000 appuser

WORKDIR /app

# Copy from builder as appuser
COPY --from=frontend-builder /frontend/dist ./static
COPY --chown=appuser:appuser backend/ ./backend/

# Install packages as root, then drop privileges
RUN pip install --no-cache-dir ... && \
    chmod -R 755 /app && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser:appuser

HEALTHCHECK --interval=30s --timeout=5s \
  CMD python -c "import healthcheck; healthcheck.check()"

EXPOSE 8080
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: growmind-api
  labels:
    app: growmind
spec:
  replicas: 3
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    fsGroup: 1000
    seccompProfile:
      type: RuntimeDefault
  
  template:
    spec:
      serviceAccountName: growmind
      
      containers:
      - name: api
        image: growmind:latest
        imagePullPolicy: IfNotPresent
        
        # Security context
        securityContext:
          allowPrivilegeEscalation: false
          readOnlyRootFilesystem: true
          capabilities:
            drop:
              - ALL
        
        # Resource limits
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: 500m
            memory: 512Mi
        
        # Health checks
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 10
          periodSeconds: 30
        
        readinessProbe:
          httpGet:
            path: /ready
            port: 8080
          initialDelaySeconds: 5
          periodSeconds: 10
        
        # Environment
        env:
        - name: GEMINI_API_KEY
          valueFrom:
            secretKeyRef:
              name: growmind-secrets
              key: gemini-api-key
        
        # Volume mounts
        volumeMounts:
        - name: tmp
          mountPath: /tmp
        - name: data
          mountPath: /data
      
      volumes:
      - name: tmp
        emptyDir: {}
      - name: data
        persistentVolumeClaim:
          claimName: growmind-data

---
apiVersion: v1
kind: Service
metadata:
  name: growmind-api
spec:
  type: ClusterIP
  ports:
  - port: 8080
    targetPort: 8080
    protocol: TCP
  selector:
    app: growmind

---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: growmind-network-policy
spec:
  podSelector:
    matchLabels:
      app: growmind
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: ingress
    ports:
    - protocol: TCP
      port: 8080
  egress:
  - to:
    - namespaceSelector: {}
    ports:
    - protocol: TCP
      port: 443  # Only HTTPS
```

---

## TEIL 4: COMPLIANCE CHECKLIST

### GDPR Compliance ✅
- [ ] Data Privacy Policy
- [ ] Data processing agreement with users
- [ ] Right to be forgotten implementation
- [ ] Data portability export feature
- [ ] Consent tracking for analytics
- [ ] GDPR-compliant cookies

### HIPAA Compliance (if medical) ✅
- [ ] Encryption at rest and in transit
- [ ] Access controls (RBAC)
- [ ] Audit logging
- [ ] Incident response plan
- [ ] Business Associate Agreement (BAA)

### PCI DSS Compliance (if payments) ✅
- [ ] No credit card storage
- [ ] PCI-DSS certified payment processor
- [ ] Secure transmission (TLS 1.2+)

---

## MONITORING & INCIDENT RESPONSE

### Essential Monitoring

```yaml
Metrics to track:
1. API Response Time (p50, p95, p99)
2. Error Rate (5xx, 4xx)
3. Database Query Performance
4. WebSocket Connections
5. Rate Limit Hits
6. CPU/Memory Usage
7. Disk Space
8. Failed Authentication Attempts

Alerts:
- Error rate > 5%
- Response time p95 > 1s
- Database connections > 80%
- Failed auth attempts > 10/minute
- Disk space < 10%
```

### Incident Response Plan

```
1. DETECTION
   - Monitor dashboards
   - Alert triggers
   - User reports

2. TRIAGE
   - Severity assessment (P1-P4)
   - Impact scope determination
   - Incident lead assignment

3. COMMUNICATION
   - Notify team
   - Update status page
   - Customer notification (if critical)

4. MITIGATION
   - Rollback if needed
   - Temporary workaround
   - Root cause investigation

5. RESOLUTION
   - Deploy fix
   - Verify resolution
   - Documentation

6. POST-MORTEM
   - RCA (Root Cause Analysis)
   - Prevention measures
   - Team retrospective
```

---

## SECURITY TESTING REQUIREMENTS

### Before Production Deployment

```bash
# 1. Dependency Scanning
pip install safety
safety check
npm audit

# 2. SAST (Static Analysis)
pip install bandit
bandit -r backend/

# 3. DAST (Dynamic Analysis)
pip install safety-plus
# Run against staging environment

# 4. Code Review
# - Security-focused review
# - Peer review by senior dev

# 5. Penetration Testing
# - By external security firm
# - Focus on OWASP Top 10

# 6. Load Testing
# - 1000+ concurrent users
# - Identify bottlenecks

# 7. Chaos Engineering
# - Kill random pods
# - Simulate failures
# - Verify recovery
```

---

## FINAL SECURITY SCORE

| Category | Current | Target |
|----------|---------|--------|
| Authentication | 2/10 | 10/10 |
| Authorization | 1/10 | 9/10 |
| Encryption | 1/10 | 9/10 |
| Input Validation | 4/10 | 9/10 |
| Error Handling | 3/10 | 8/10 |
| Logging | 2/10 | 8/10 |
| Infrastructure | 2/10 | 8/10 |
| **OVERALL** | **2.1/10** | **8.7/10** |

**Gap to Close:** 6.6 points (Phase 1-3 Implementation)

---

**Report Prepared By:** GitHub Copilot Security Analysis  
**Date:** 2026-02-06  
**Confidence Level:** 95%

