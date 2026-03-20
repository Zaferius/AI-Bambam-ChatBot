"""
Proje dosya yönetimi: Takım üyelerinin ürettiği kodları dosyalara çıkarma,
proje klasörü yönetimi ve iframe preview için serve etme.
"""
import os
import re
import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List
from auth import get_current_user

router = APIRouter(prefix="/api/projects", tags=["Projects"])

db = None
PROJECTS_DIR = Path(__file__).parent / "projects"

def init_projects(database):
    global db
    db = database
    PROJECTS_DIR.mkdir(exist_ok=True)


def get_project_dir(team_id: str) -> Path:
    """Takımın proje klasörünü döndür, yoksa oluştur"""
    d = PROJECTS_DIR / team_id
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---- Kod bloğu parse ----

CODE_BLOCK_PATTERN = re.compile(
    r'```(?:(\w+):)?(\S+?)\n(.*?)```',
    re.DOTALL
)

FILE_HEADER_PATTERN = re.compile(
    r'```(\w*)\s*\n\s*(?://|#|<!--)\s*(?:file|filename|dosya):\s*(\S+?)(?:\s*-->)?\s*\n(.*?)```',
    re.DOTALL
)

IMPLICIT_PATTERN = re.compile(
    r'(?:^|\n)\*\*(\S+\.\w+)\*\*\s*(?::\s*)?\n```\w*\n(.*?)```',
    re.DOTALL
)


def extract_files_from_text(text: str) -> list:
    """AI cevabından dosya adı + içerik çiftlerini çıkar.
    
    Desteklenen formatlar:
    1) ```html:index.html\n...\n```
    2) ```html\n// file: index.html\n...\n```
    3) **index.html**\n```html\n...\n```
    """
    files = []
    seen = set()

    # Format 1: ```lang:filename\n...\n```
    for m in CODE_BLOCK_PATTERN.finditer(text):
        lang, fname, content = m.group(1), m.group(2), m.group(3)
        # lang None olabilir, fname her zaman var
        if fname and '.' in fname and fname not in seen:
            files.append({"path": fname.strip(), "content": content.rstrip()})
            seen.add(fname.strip())

    # Format 2: ```lang\n// file: filename\n...\n```
    for m in FILE_HEADER_PATTERN.finditer(text):
        fname, content = m.group(2), m.group(3)
        if fname and fname not in seen:
            files.append({"path": fname.strip(), "content": content.rstrip()})
            seen.add(fname.strip())

    # Format 3: **filename.ext**\n```...\n```
    for m in IMPLICIT_PATTERN.finditer(text):
        fname, content = m.group(1), m.group(2)
        if fname and fname not in seen:
            files.append({"path": fname.strip(), "content": content.rstrip()})
            seen.add(fname.strip())

    return files


def save_extracted_files(team_id: str, files: list) -> list:
    """Çıkarılan dosyaları proje klasörüne kaydet"""
    project_dir = get_project_dir(team_id)
    saved = []
    for f in files:
        fpath = project_dir / f["path"]
        fpath.parent.mkdir(parents=True, exist_ok=True)
        fpath.write_text(f["content"], encoding="utf-8")
        saved.append(f["path"])
    return saved


# ---- API Endpoint'leri ----

class WriteFileRequest(BaseModel):
    path: str
    content: str

class DeleteFileRequest(BaseModel):
    path: str


@router.get("/{team_id}/files")
async def list_project_files(
    team_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Proje dosyalarını ağaç yapısında listele"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    files = []
    for p in sorted(project_dir.rglob("*")):
        if p.is_file():
            rel = p.relative_to(project_dir).as_posix()
            files.append({
                "path": rel,
                "size": p.stat().st_size,
                "ext": p.suffix
            })
    return {"files": files, "team_id": team_id}


@router.get("/{team_id}/files/{file_path:path}")
async def read_project_file(
    team_id: str,
    file_path: str,
    current_user: dict = Depends(get_current_user)
):
    """Belirli bir dosyanın içeriğini oku"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    fpath = project_dir / file_path
    if not fpath.exists() or not fpath.is_file():
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    
    # Güvenlik: proje klasörü dışına çıkmayı engelle
    try:
        fpath.resolve().relative_to(project_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Geçersiz dosya yolu")

    content = fpath.read_text(encoding="utf-8", errors="replace")
    return {"path": file_path, "content": content}


@router.post("/{team_id}/files")
async def write_project_file(
    team_id: str,
    req: WriteFileRequest,
    current_user: dict = Depends(get_current_user)
):
    """Dosya yaz veya güncelle"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    fpath = project_dir / req.path
    
    # Güvenlik
    try:
        fpath.resolve().relative_to(project_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Geçersiz dosya yolu")

    fpath.parent.mkdir(parents=True, exist_ok=True)
    fpath.write_text(req.content, encoding="utf-8")
    return {"path": req.path, "message": "Dosya kaydedildi"}


@router.delete("/{team_id}/files")
async def delete_project_file(
    team_id: str,
    req: DeleteFileRequest,
    current_user: dict = Depends(get_current_user)
):
    """Dosya sil"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    fpath = project_dir / req.path
    
    try:
        fpath.resolve().relative_to(project_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Geçersiz dosya yolu")

    if fpath.exists():
        fpath.unlink()
        return {"message": "Dosya silindi"}
    raise HTTPException(status_code=404, detail="Dosya bulunamadı")


@router.delete("/{team_id}/reset")
async def reset_project(
    team_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Proje klasörünü tamamen sıfırla"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    if project_dir.exists():
        shutil.rmtree(project_dir)
        project_dir.mkdir()
    return {"message": "Proje sıfırlandı"}


@router.post("/{team_id}/extract")
async def extract_files_endpoint(
    team_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Takımın tüm chat geçmişinden dosyaları çıkar ve proje klasörüne kaydet"""
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    members = db.get_team_members(team_id)
    all_files = []
    
    for member in members:
        messages = db.get_messages(member["chat_id"])
        for msg in messages:
            if msg["role"] == "assistant":
                extracted = extract_files_from_text(msg["content"])
                all_files.extend(extracted)
    
    saved = save_extracted_files(team_id, all_files)
    return {"extracted": len(saved), "files": saved}
