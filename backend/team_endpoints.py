from fastapi import APIRouter, HTTPException, Depends, Request, Form
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import List, Optional
from auth import get_current_user, decode_token
from openai import OpenAI
import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor

router = APIRouter(prefix="/api/teams", tags=["Teams"])

db = None

def init_teams(database):
    global db
    db = database

def _get_llm_clients():
    """LLM client'ları al (main.py'deki global'ları kullanmak yerine lazy init)"""
    clients = {}
    if os.getenv("OPENAI_API_KEY"):
        clients["openai"] = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    if os.getenv("GROQ_API_KEY"):
        clients["groq"] = OpenAI(api_key=os.getenv("GROQ_API_KEY"), base_url="https://api.groq.com/openai/v1")
    if os.getenv("OPENROUTER_API_KEY"):
        clients["openrouter"] = OpenAI(api_key=os.getenv("OPENROUTER_API_KEY"), base_url="https://openrouter.ai/api/v1")
    return clients


# ===== MODELS =====

class MemberInput(BaseModel):
    role_name: str
    description: Optional[str] = None
    system_prompt: str
    icon: Optional[str] = "🤖"

class CreateTeamRequest(BaseModel):
    name: str
    description: Optional[str] = None
    members: List[MemberInput]

class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class AddMemberRequest(BaseModel):
    role_name: str
    description: Optional[str] = None
    system_prompt: str
    icon: Optional[str] = "🤖"


# ===== ENDPOINTS =====

@router.post("")
async def create_team(req: CreateTeamRequest, current_user: dict = Depends(get_current_user)):
    """Yeni takım oluştur + üyelerini ekle"""
    if not req.members or len(req.members) == 0:
        raise HTTPException(status_code=400, detail="En az bir üye gerekli")
    
    team = db.create_team(req.name, current_user["id"], req.description)
    
    members = []
    for m in req.members:
        member = db.add_team_member(
            team_id=team["id"],
            role_name=m.role_name,
            system_prompt=m.system_prompt,
            description=m.description,
            icon=m.icon or "🤖"
        )
        members.append(member)
    
    team["members"] = members
    return team


@router.get("")
async def list_teams(current_user: dict = Depends(get_current_user)):
    """Kullanıcının takımlarını listele"""
    teams = db.get_teams_by_user(current_user["id"])
    
    for team in teams:
        team["members"] = db.get_team_members(team["id"])
    
    return teams


@router.get("/{team_id}")
async def get_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Takım detayını getir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    team["members"] = db.get_team_members(team_id)
    return team


@router.put("/{team_id}")
async def update_team(team_id: str, req: UpdateTeamRequest, current_user: dict = Depends(get_current_user)):
    """Takım bilgilerini güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    updated = db.update_team(team_id, name=req.name, description=req.description)
    updated["members"] = db.get_team_members(team_id)
    return updated


@router.delete("/{team_id}")
async def delete_team(team_id: str, current_user: dict = Depends(get_current_user)):
    """Takımı sil"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    db.delete_team(team_id)
    return {"message": "Takım silindi"}


@router.post("/{team_id}/members")
async def add_member(team_id: str, req: AddMemberRequest, current_user: dict = Depends(get_current_user)):
    """Takıma yeni üye ekle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.add_team_member(
        team_id=team_id,
        role_name=req.role_name,
        system_prompt=req.system_prompt,
        description=req.description,
        icon=req.icon or "🤖"
    )
    return member


@router.delete("/{team_id}/members/{member_id}")
async def remove_member(team_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Takım üyesini sil"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    db.delete_team_member(member_id)
    return {"message": "Üye silindi"}


@router.get("/{team_id}/members/{member_id}/messages")
async def get_member_messages(team_id: str, member_id: str, current_user: dict = Depends(get_current_user)):
    """Üyenin chat mesajlarını getir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    messages = db.get_messages(member["chat_id"])
    return messages


class TeamChatRequest(BaseModel):
    message: str
    model: Optional[str] = "gpt-4o-mini"


@router.post("/{team_id}/members/{member_id}/chat")
async def team_member_chat(
    team_id: str, 
    member_id: str, 
    req: TeamChatRequest,
    current_user: dict = Depends(get_current_user)
):
    """Takım üyesiyle sohbet et - rolün system prompt'u ile LLM'e gönderir"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    member = db.get_team_member(member_id)
    if not member or member["team_id"] != team_id:
        raise HTTPException(status_code=404, detail="Üye bulunamadı")
    
    chat_id = member["chat_id"]
    
    # Kullanıcı mesajını DB'ye kaydet
    db.add_message(chat_id, "user", req.message, model_name=req.model)
    
    # Mesaj geçmişini al
    history = db.get_messages(chat_id)
    
    # LLM mesajlarını hazırla
    llm_messages = [
        {"role": "system", "content": member["system_prompt"]}
    ]
    
    # Son 20 mesajı ekle
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({
            "role": msg["role"],
            "content": msg["content"]
        })
    
    # Model provider belirle
    model_id = req.model or "gpt-4o-mini"
    
    if model_id.startswith("groq:"):
        provider = "groq"
        model_name = model_id.replace("groq:", "")
    elif model_id.startswith("openrouter:"):
        provider = "openrouter"
        model_name = model_id.replace("openrouter:", "")
    elif model_id.startswith("bambam:lite"):
        provider = "groq"
        model_name = "llama-3.1-8b-instant"
    elif model_id.startswith("bambam:max"):
        provider = "openrouter"
        model_name = "anthropic/claude-3.5-sonnet"
    else:
        provider = "openai"
        model_name = model_id if not model_id.startswith("bambam:") else "gpt-4o-mini"
    
    clients = _get_llm_clients()
    client = clients.get(provider)
    
    if not client:
        raise HTTPException(status_code=500, detail=f"{provider} API key yapılandırılmamış")
    
    def generate():
        full_reply = ""
        try:
            stream = client.chat.completions.create(
                model=model_name,
                messages=llm_messages,
                stream=True
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_reply += delta
                    yield delta
        except Exception as e:
            yield f"Error: {str(e)}"
        
        # Bot cevabını DB'ye kaydet
        if full_reply:
            try:
                db.add_message(chat_id, "assistant", full_reply, model_name=req.model)
            except Exception as e:
                print(f"DB save team bot message error: {e}")
    
    return StreamingResponse(generate(), media_type="text/plain")


class MasterPromptRequest(BaseModel):
    message: str
    model: Optional[str] = "gpt-4o-mini"


def _resolve_model(model_id: str):
    """Model ID'den provider ve model adı çıkar"""
    if model_id.startswith("groq:"):
        return "groq", model_id.replace("groq:", "")
    elif model_id.startswith("openrouter:"):
        return "openrouter", model_id.replace("openrouter:", "")
    elif model_id.startswith("bambam:lite"):
        return "groq", "llama-3.1-8b-instant"
    elif model_id.startswith("bambam:max"):
        return "openrouter", "anthropic/claude-3.5-sonnet"
    else:
        return "openai", model_id if not model_id.startswith("bambam:") else "gpt-4o-mini"


def _run_member_chat(member, message, model_id, clients):
    """Bir üye için senkron LLM çağrısı (thread'de çalışır)"""
    provider, model_name = _resolve_model(model_id)
    client = clients.get(provider)
    
    if not client:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {provider} API key yapılandırılmamış",
            "error": True
        }
    
    chat_id = member["chat_id"]
    
    # Kullanıcı mesajını kaydet
    try:
        db.add_message(chat_id, "user", message, model_name=model_id)
    except:
        pass
    
    # Mesaj geçmişini al
    history = db.get_messages(chat_id)
    
    llm_messages = [
        {"role": "system", "content": member["system_prompt"]}
    ]
    recent = history[-20:] if len(history) > 20 else history
    for msg in recent:
        llm_messages.append({"role": msg["role"], "content": msg["content"]})
    
    try:
        response = client.chat.completions.create(
            model=model_name,
            messages=llm_messages,
            stream=False
        )
        content = response.choices[0].message.content
        
        # Bot cevabını kaydet
        try:
            db.add_message(chat_id, "assistant", content, model_name=model_id)
        except:
            pass
        
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": content,
            "error": False
        }
    except Exception as e:
        return {
            "member_id": member["id"],
            "role_name": member["role_name"],
            "icon": member.get("icon", "🤖"),
            "content": f"Hata: {str(e)}",
            "error": True
        }


@router.post("/{team_id}/master")
async def master_prompt(
    team_id: str,
    req: MasterPromptRequest,
    current_user: dict = Depends(get_current_user)
):
    """Tüm takım üyelerine aynı anda master prompt gönder, paralel çalıştır"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Bu takıma erişiminiz yok")
    
    members = db.get_team_members(team_id)
    if not members:
        raise HTTPException(status_code=400, detail="Takımda üye yok")
    
    clients = _get_llm_clients()
    
    # Tüm üyelere paralel istek gönder
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=len(members))
    
    tasks = [
        loop.run_in_executor(executor, _run_member_chat, member, req.message, req.model, clients)
        for member in members
    ]
    
    results = await asyncio.gather(*tasks)
    
    # Birleştirme: Tüm sonuçları topla
    combined_parts = []
    for r in results:
        combined_parts.append(f"## {r['icon']} {r['role_name']}\n\n{r['content']}")
    
    combined = "\n\n---\n\n".join(combined_parts)
    
    return {
        "results": results,
        "combined": combined
    }
