"""
Chat CRUD endpoints for Bambam AI
Production-ready chat management with database persistence
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

router = APIRouter()

# Pydantic models
class ChatCreate(BaseModel):
    title: Optional[str] = "New Chat"
    user_id: Optional[str] = "default"

class ChatUpdate(BaseModel):
    title: str

class MessageCreate(BaseModel):
    chat_id: str
    role: str
    content: str
    model_name: Optional[str] = None
    images: Optional[List[str]] = None

class ChatResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    user_id: str
    message_count: Optional[int] = 0

class MessageResponse(BaseModel):
    id: int
    chat_id: str
    role: str
    content: str
    model_name: Optional[str] = None
    images: Optional[List[str]] = None
    created_at: str

# Endpoints will be added in main.py
def setup_chat_routes(app, db):
    """Setup chat CRUD routes"""
    
    @app.post("/api/chats", response_model=ChatResponse)
    async def create_chat(chat: ChatCreate):
        """Yeni chat oluştur"""
        chat_id = f"chat-{int(datetime.now().timestamp() * 1000)}"
        result = db.create_chat(chat_id, chat.title, chat.user_id)
        return ChatResponse(**result, message_count=0)
    
    @app.get("/api/chats", response_model=List[ChatResponse])
    async def list_chats(user_id: str = "default", limit: int = 100):
        """Kullanıcının chatlerini listele"""
        chats = db.list_chats(user_id, limit)
        return [ChatResponse(**chat) for chat in chats]
    
    @app.get("/api/chats/{chat_id}", response_model=ChatResponse)
    async def get_chat(chat_id: str):
        """Chat detaylarını getir"""
        chat = db.get_chat(chat_id)
        if not chat:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        message_count = db.get_message_count(chat_id)
        return ChatResponse(**chat, message_count=message_count)
    
    @app.put("/api/chats/{chat_id}")
    async def update_chat(chat_id: str, chat: ChatUpdate):
        """Chat başlığını güncelle"""
        existing = db.get_chat(chat_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        db.update_chat_title(chat_id, chat.title)
        return {"success": True, "message": "Chat updated"}
    
    @app.delete("/api/chats/{chat_id}")
    async def delete_chat(chat_id: str):
        """Chat'i sil"""
        existing = db.get_chat(chat_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Chat not found")
        
        db.delete_chat(chat_id)
        return {"success": True, "message": "Chat deleted"}
    
    @app.get("/api/chats/{chat_id}/messages", response_model=List[MessageResponse])
    async def get_messages(chat_id: str, limit: Optional[int] = None, offset: int = 0):
        """Chat mesajlarını getir (pagination destekli)"""
        messages = db.get_messages(chat_id, limit, offset)
        return [MessageResponse(**msg) for msg in messages]
    
    @app.post("/api/chats/{chat_id}/messages")
    async def add_message(chat_id: str, message: MessageCreate):
        """Chat'e mesaj ekle"""
        db.add_message(
            chat_id,
            message.role,
            message.content,
            message.model_name,
            message.images
        )
        return {"success": True, "message": "Message added"}
    
    @app.get("/api/stats")
    async def get_stats():
        """Database istatistikleri"""
        return db.get_database_stats()
    
    @app.post("/api/cleanup")
    async def cleanup_old_data(days: int = 30, user_id: str = "default"):
        """Eski chatları temizle"""
        deleted = db.cleanup_old_chats(days, user_id)
        return {
            "success": True,
            "deleted_chats": deleted,
            "message": f"Deleted {deleted} chats older than {days} days"
        }
