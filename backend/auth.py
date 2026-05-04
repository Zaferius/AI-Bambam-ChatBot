from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from jose import JWTError, jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
import os
import re
import time
from collections import defaultdict

# JWT Config
APP_ENV = os.getenv("APP_ENV", "development").lower()
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    if APP_ENV in ("development", "dev", "local"):
        SECRET_KEY = "dev-insecure-key-change-me"
    else:
        raise RuntimeError("JWT_SECRET_KEY is required outside development")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Password hashing

# Security
security = HTTPBearer(auto_error=False)

# Router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# DB reference - will be set from main.py
db = None
auth_rate_limit_store = defaultdict(list)
AUTH_RATE_LIMIT = 15

def init_auth(database):
    """Auth modülünü database ile başlat"""
    global db
    db = database


def _dev_auth_bypass_enabled() -> bool:
    return (
        os.getenv("ALLOW_DEV_AUTH_BYPASS", "false").lower() == "true"
        and APP_ENV in ("development", "dev", "local")
    )


def _check_auth_rate_limit(client_ip: str, limit: int = AUTH_RATE_LIMIT) -> bool:
    now = time.time()
    auth_rate_limit_store[client_ip] = [
        t for t in auth_rate_limit_store[client_ip] if now - t < 60
    ]
    if len(auth_rate_limit_store[client_ip]) >= limit:
        return False
    auth_rate_limit_store[client_ip].append(now)
    return True


# ===== MODELS =====

class SignupRequest(BaseModel):
    email: str
    username: str
    password: str
    
    @validator('email')
    def validate_email(cls, v):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError('Please enter a valid email address')
        return v.lower()
    
    @validator('username')
    def validate_username(cls, v):
        if len(v) < 3 or len(v) > 30:
            raise ValueError('Username must be between 3 and 30 characters')
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscore')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters long')
        return v


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


# ===== HELPERS =====

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": user_id,
        "username": username,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """JWT token'dan mevcut kullanıcıyı al"""
    # Dev bypass (env: BYPASS_AUTH=true)
    if _dev_auth_bypass_enabled():
        return {
            "id": "dev-bypass",
            "email": "dev@bambam.local",
            "username": "dev"
        }

    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication token required")
    
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    user = db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"]
    }


async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Opsiyonel auth - token yoksa None döner"""
    # Dev bypass (env: BYPASS_AUTH=true)
    if _dev_auth_bypass_enabled():
        return {
            "id": "dev-bypass",
            "email": "dev@bambam.local",
            "username": "dev"
        }
    
    if credentials is None:
        return None
    
    payload = decode_token(credentials.credentials)
    if payload is None:
        return None
    
    user_id = payload.get("sub")
    if user_id is None:
        return None
    
    user = db.get_user_by_id(user_id)
    if user is None:
        return None
    
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"]
    }


# ===== ENDPOINTS =====

@router.post("/signup", response_model=TokenResponse)
async def signup(req: SignupRequest, request: Request):
    """Yeni kullanıcı kaydı"""
    client_ip = request.client.host if request.client else "unknown"
    if not _check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many auth requests. Please wait a minute.")

    # Email kontrolü
    existing = db.get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="This email is already registered")
    
    # Username kontrolü
    existing = db.get_user_by_username(req.username)
    if existing:
        raise HTTPException(status_code=400, detail="This username is already taken")
    
    # Kullanıcı oluştur
    password_hash = hash_password(req.password)
    user = db.create_user(req.email, req.username, password_hash)
    
    if user is None:
        raise HTTPException(status_code=500, detail="User could not be created")
    
    # Yeni kullanıcıya 20 hoş geldin kredisi ver
    db.init_user_credits(user["id"], initial_balance=20.0)

    # Token oluştur
    token = create_access_token(user["id"], user["username"])
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
            "credits": 20.0,
        }
    )


@router.post("/login", response_model=TokenResponse)
async def login(req: LoginRequest, request: Request):
    """Kullanıcı girişi"""
    client_ip = request.client.host if request.client else "unknown"
    if not _check_auth_rate_limit(client_ip):
        raise HTTPException(status_code=429, detail="Too many auth requests. Please wait a minute.")
    user = db.get_user_by_email(req.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Account disabled")
    
    # Son giriş zamanını güncelle
    db.update_last_login(user["id"])
    
    # Token oluştur
    token = create_access_token(user["id"], user["username"])
    
    return TokenResponse(
        access_token=token,
        user={
            "id": user["id"],
            "email": user["email"],
            "username": user["username"]
        }
    )


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Mevcut kullanıcı bilgilerini getir"""
    return current_user


@router.post("/verify")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Token geçerliliğini kontrol et"""
    return {"valid": True, "user": current_user}
