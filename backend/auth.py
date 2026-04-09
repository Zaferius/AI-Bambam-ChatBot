from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, validator
from jose import JWTError, jwt
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
import os
import re

# JWT Config
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "bambam-super-secret-key-change-in-production-2024")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Password hashing

# Security
security = HTTPBearer(auto_error=False)

# Router
router = APIRouter(prefix="/auth", tags=["Authentication"])

# DB reference - will be set from main.py
db = None

def init_auth(database):
    """Auth modülünü database ile başlat"""
    global db
    db = database


# ===== MODELS =====

class SignupRequest(BaseModel):
    email: str
    username: str
    password: str
    
    @validator('email')
    def validate_email(cls, v):
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(pattern, v):
            raise ValueError('Geçerli bir email adresi girin')
        return v.lower()
    
    @validator('username')
    def validate_username(cls, v):
        if len(v) < 3 or len(v) > 30:
            raise ValueError('Kullanıcı adı 3-30 karakter olmalı')
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Kullanıcı adı sadece harf, rakam ve _ içerebilir')
        return v
    
    @validator('password')
    def validate_password(cls, v):
        if len(v) < 6:
            raise ValueError('Şifre en az 6 karakter olmalı')
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
    if os.getenv("BYPASS_AUTH", "false").lower() == "true":
        return {
            "id": "dev-bypass",
            "email": "dev@bambam.local",
            "username": "dev"
        }

    if credentials is None:
        raise HTTPException(status_code=401, detail="Token gerekli")
    
    payload = decode_token(credentials.credentials)
    if payload is None:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")
    
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Geçersiz token")
    
    user = db.get_user_by_id(user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Hesap devre dışı")
    
    return {
        "id": user["id"],
        "email": user["email"],
        "username": user["username"]
    }


async def get_optional_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Opsiyonel auth - token yoksa None döner"""
    # Dev bypass (env: BYPASS_AUTH=true)
    if os.getenv("BYPASS_AUTH", "false").lower() == "true":
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
async def signup(req: SignupRequest):
    """Yeni kullanıcı kaydı"""
    # Email kontrolü
    existing = db.get_user_by_email(req.email)
    if existing:
        raise HTTPException(status_code=400, detail="Bu email zaten kayıtlı")
    
    # Username kontrolü
    existing = db.get_user_by_username(req.username)
    if existing:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış")
    
    # Kullanıcı oluştur
    password_hash = hash_password(req.password)
    user = db.create_user(req.email, req.username, password_hash)
    
    if user is None:
        raise HTTPException(status_code=500, detail="Kullanıcı oluşturulamadı")
    
    # Yeni kullanıcıya 20 hoş geldin kredisi ver
    try:
        db.init_user_credits(user["id"], initial_balance=20.0)
    except Exception:
        pass  # Non-critical — don't block signup if credits fail

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
async def login(req: LoginRequest):
    """Kullanıcı girişi"""
    user = db.get_user_by_email(req.email)
    
    if not user:
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    
    if not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email veya şifre hatalı")
    
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Hesap devre dışı")
    
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
