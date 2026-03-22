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


def get_project_dir(team_id: str, project_id: Optional[str] = None) -> Path:
    """Aktif veya belirtilen proje klasörünü döndür, yoksa oluştur."""
    if project_id is None and db:
        active_project = db.get_active_team_project(team_id)
        if active_project:
            project_id = active_project["id"]

    legacy_dir = PROJECTS_DIR / team_id
    if project_id is None:
        legacy_dir.mkdir(parents=True, exist_ok=True)
        return legacy_dir

    project_root = PROJECTS_DIR / team_id / project_id
    project_root.mkdir(parents=True, exist_ok=True)
    return project_root


# ---- Kod bloğu parse ----

CODE_BLOCK_PATTERN = re.compile(r"```(?:(\w+):)?(\S+?)\n(.*?)```", re.DOTALL)

FILE_HEADER_PATTERN = re.compile(
    r"```(\w*)\s*\n\s*(?://|#|<!--)\s*(?:file|filename|dosya):\s*(\S+?)(?:\s*-->)?\s*\n(.*?)```",
    re.DOTALL,
)

IMPLICIT_PATTERN = re.compile(
    r"(?:^|\n)\*\*(\S+\.\w+)\*\*\s*(?::\s*)?\n```\w*\n(.*?)```", re.DOTALL
)

INLINE_FILE_MARKER_PATTERN = re.compile(
    r"^\s*`?([a-zA-Z0-9_+\-]+):([a-zA-Z0-9_./\-]+\.[a-zA-Z0-9]+)`?\s*$", re.IGNORECASE
)


def _extract_inline_marker_files(text: str) -> list:
    """Format 4 parser: html:index.html satırı ile başlayan düz bloklar."""
    files = []
    lines = (text or "").splitlines()
    i = 0

    while i < len(lines):
        marker = INLINE_FILE_MARKER_PATTERN.match(lines[i])
        if not marker:
            i += 1
            continue

        fname = marker.group(2).strip()
        j = i + 1
        while j < len(lines) and not INLINE_FILE_MARKER_PATTERN.match(lines[j]):
            j += 1

        content = "\n".join(lines[i + 1 : j]).strip("\n")
        if fname and content.strip():
            files.append({"path": fname, "content": content})

        i = j

    return files


def extract_files_from_text(text: str) -> list:
    """AI cevabından dosya adı + içerik çiftlerini çıkar.

    Desteklenen formatlar:
    1) ```html:index.html\n...\n```
    2) ```html\n// file: index.html\n...\n```
    3) **index.html**\n```html\n...\n```
    4) html:index.html\n... (bir sonraki "lang:dosya" marker'ına kadar)
    """
    files = []
    seen = set()

    # Format 1: ```lang:filename\n...\n```
    for m in CODE_BLOCK_PATTERN.finditer(text):
        lang, fname, content = m.group(1), m.group(2), m.group(3)
        # lang None olabilir, fname her zaman var
        if fname and "." in fname and fname not in seen:
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

    # Format 4: html:index.html\n... (inline marker)
    for f in _extract_inline_marker_files(text):
        fname = f["path"].strip()
        if fname and fname not in seen:
            files.append({"path": fname, "content": f["content"].rstrip()})
            seen.add(fname)

    return files


def save_extracted_files(team_id: str, files: list) -> list:
    """Çıkarılan dosyaları proje klasörüne kaydet.
    Returns: list of dicts {"path": str, "status": "added"|"updated"}
    """
    project_dir = get_project_dir(team_id)
    saved = []
    for f in files:
        fpath = project_dir / f["path"]
        fpath.parent.mkdir(parents=True, exist_ok=True)
        status = "updated" if fpath.exists() else "added"
        fpath.write_text(f["content"], encoding="utf-8")
        saved.append({"path": f["path"], "status": status})
    # Dosyalar kaydedildikten sonra index.html'i otomatik düzelt
    auto_fix_index_html(project_dir)
    return saved


def save_extracted_files_with_proposals(
    team_id: str,
    files: list,
    run_id: Optional[str] = None,
    task_id: Optional[str] = None,
    member_id: Optional[str] = None,
) -> list:
    """Dosyaları proposal + file lock akışıyla kaydet.

    Returns: list of dicts with proposal/lock/apply status.
    """
    project_dir = get_project_dir(team_id)
    saved = []
    touched_any = False

    for f in files:
        path = f.get("path", "")
        content = f.get("content", "")
        if not path:
            continue

        active_lock = db.get_active_file_lock(team_id, path) if db else None
        conflict = bool(active_lock and active_lock.get("member_id") != member_id)

        proposal = (
            db.create_file_proposal(
                team_id=team_id,
                file_path=path,
                content=content,
                run_id=run_id,
                task_id=task_id,
                member_id=member_id,
                status="conflict" if conflict else "pending",
            )
            if db
            else None
        )

        if conflict:
            saved.append(
                {
                    "path": path,
                    "status": "conflict",
                    "proposal_id": proposal["id"] if proposal else None,
                    "lock_member_id": active_lock.get("member_id")
                    if active_lock
                    else None,
                }
            )
            continue

        lock = (
            db.create_file_lock(
                team_id=team_id,
                file_path=path,
                run_id=run_id,
                task_id=task_id,
                member_id=member_id,
            )
            if db
            else None
        )

        fpath = project_dir / path
        fpath.parent.mkdir(parents=True, exist_ok=True)
        status = "updated" if fpath.exists() else "added"
        fpath.write_text(content, encoding="utf-8")
        touched_any = True

        if proposal and db:
            db.update_file_proposal_status(proposal["id"], "applied")
        if lock and db:
            db.release_file_lock(lock["id"])

        saved.append(
            {
                "path": path,
                "status": status,
                "proposal_id": proposal["id"] if proposal else None,
                "lock_id": lock["id"] if lock else None,
            }
        )

    if touched_any:
        auto_fix_index_html(project_dir)

    return saved


def auto_fix_index_html(project_dir: Path):
    """index.html'deki eksik JS/CSS referanslarını ve DOM elementlerini otomatik ekle.

    Takım üyeleri bağımsız çalıştığı için dosyalar birbirini referans etmeyebilir.
    Bu fonksiyon:
    1. Proje klasöründeki .js ve .css dosyalarını bulur
    2. index.html'de referans yoksa <link>/<script> ekler
    3. JS'de kullanılan getElementById elementleri HTML'de yoksa ekler
    """
    index_path = project_dir / "index.html"
    if not index_path.exists():
        return

    html = index_path.read_text(encoding="utf-8")
    html_lower = html.lower()
    modified = False

    # 1. Eksik CSS referanslarını ekle
    css_files = [
        p.relative_to(project_dir).as_posix()
        for p in project_dir.rglob("*.css")
        if p.is_file()
    ]
    css_inject = []
    for css in css_files:
        # Dosya zaten referans edilmiş mi kontrol et
        if css not in html and css.split("/")[-1] not in html:
            css_inject.append(f'    <link rel="stylesheet" href="{css}">')

    # 2. Eksik JS referanslarını ekle (backend/server dosyalarını hariç tut)
    server_keywords = [
        "express",
        "require(",
        "module.exports",
        "const app = ",
        "router.post",
        "router.get",
        "app.listen",
        "flask",
        "fastapi",
    ]
    js_files = [p for p in project_dir.rglob("*.js") if p.is_file()]

    frontend_js = []
    for js_path in js_files:
        js_name = js_path.relative_to(project_dir).as_posix()
        # Zaten HTML'de var mı?
        if js_name in html or js_name.split("/")[-1] in html:
            continue
        # Server-side JS mi kontrol et
        try:
            js_content = js_path.read_text(encoding="utf-8").lower()
            is_server = any(kw in js_content for kw in server_keywords)
            if is_server:
                continue
        except:
            continue
        frontend_js.append(js_name)

    js_inject = [f'    <script src="{js}"></script>' for js in frontend_js]

    # 3. JS dosyalarında getElementById ile kullanılan elementleri bul
    import re as _re

    missing_elements = {}
    all_frontend_js = []
    for js_path in project_dir.rglob("*.js"):
        try:
            js_content = js_path.read_text(encoding="utf-8")
            js_lower = js_content.lower()
            if any(kw in js_lower for kw in server_keywords):
                continue
            all_frontend_js.append(js_content)
        except:
            continue

    for js_content in all_frontend_js:
        # getElementById('xxx') veya getElementById("xxx") bul
        for match in _re.finditer(r'getElementById\([\'"]([^\'"]+)[\'"]\)', js_content):
            elem_id = match.group(1)
            # HTML'de bu id var mı?
            if f'id="{elem_id}"' not in html and f"id='{elem_id}'" not in html:
                # Element tipini tahmin et
                elem_id_lower = elem_id.lower()
                if "canvas" in elem_id_lower:
                    missing_elements[elem_id] = (
                        f'<canvas id="{elem_id}" style="display:none;"></canvas>'
                    )
                elif "download" in elem_id_lower or "link" in elem_id_lower:
                    missing_elements[elem_id] = (
                        f'<a id="{elem_id}" style="display:none;" href="#">İndir</a>'
                    )
                elif (
                    "preview" in elem_id_lower
                    or "image" in elem_id_lower
                    or "img" in elem_id_lower
                ):
                    missing_elements[elem_id] = (
                        f'<img id="{elem_id}" style="display:none;max-width:100%;" />'
                    )
                elif (
                    "result" in elem_id_lower
                    or "output" in elem_id_lower
                    or "status" in elem_id_lower
                    or "message" in elem_id_lower
                ):
                    missing_elements[elem_id] = f'<div id="{elem_id}"></div>'
                elif "input" in elem_id_lower and "file" not in elem_id_lower:
                    missing_elements[elem_id] = f'<input id="{elem_id}" type="text" />'
                # fileInput, convertButton gibi zaten olan elementleri ekleme

    # HTML'e enjekte et
    if css_inject or js_inject or missing_elements:
        # CSS'leri </head> öncesine ekle
        if css_inject and "</head>" in html:
            html = html.replace("</head>", "\n".join(css_inject) + "\n</head>")
            modified = True

        # Eksik elementleri </body> öncesine (ama script'lerden önce) ekle
        if missing_elements:
            elements_html = "\n    ".join(missing_elements.values())
            if "</body>" in html:
                html = html.replace(
                    "</body>",
                    f"\n    <!-- Auto-generated missing elements -->\n    {elements_html}\n</body>",
                )
                modified = True

        # JS'leri </body> öncesine ekle
        if js_inject:
            if "</body>" in html:
                html = html.replace("</body>", "\n".join(js_inject) + "\n</body>")
                modified = True
            elif "</html>" in html:
                html = html.replace("</html>", "\n".join(js_inject) + "\n</html>")
                modified = True
            else:
                html += "\n" + "\n".join(js_inject)
                modified = True

        if modified:
            index_path.write_text(html, encoding="utf-8")
            print(
                f"[auto_fix] index.html updated: +{len(css_inject)} CSS, +{len(js_inject)} JS, +{len(missing_elements)} elements"
            )


# ---- API Endpoint'leri ----


class WriteFileRequest(BaseModel):
    path: str
    content: str


class DeleteFileRequest(BaseModel):
    path: str


class ProposalActionRequest(BaseModel):
    proposal_id: str


@router.get("/{team_id}/files")
async def list_project_files(
    team_id: str, current_user: dict = Depends(get_current_user)
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
            files.append({"path": rel, "size": p.stat().st_size, "ext": p.suffix})
    return {"files": files, "team_id": team_id}


@router.get("/{team_id}/files/{file_path:path}")
async def read_project_file(
    team_id: str, file_path: str, current_user: dict = Depends(get_current_user)
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
    team_id: str, req: WriteFileRequest, current_user: dict = Depends(get_current_user)
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
    team_id: str, req: DeleteFileRequest, current_user: dict = Depends(get_current_user)
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
async def reset_project(team_id: str, current_user: dict = Depends(get_current_user)):
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
    team_id: str, current_user: dict = Depends(get_current_user)
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


@router.post("/{team_id}/proposals/approve")
async def approve_file_proposal(
    team_id: str,
    req: ProposalActionRequest,
    current_user: dict = Depends(get_current_user),
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    proposal = db.get_file_proposal(req.proposal_id)
    if not proposal or proposal.get("team_id") != team_id:
        raise HTTPException(status_code=404, detail="Proposal bulunamadı")
    if proposal.get("status") not in ("pending", "conflict"):
        raise HTTPException(status_code=400, detail="Proposal bu durumda onaylanamaz")

    project_dir = get_project_dir(team_id)
    file_path = proposal["file_path"]
    active_lock = db.get_active_file_lock(team_id, file_path)
    if active_lock and active_lock.get("task_id") != proposal.get("task_id"):
        raise HTTPException(
            status_code=409, detail="Dosya halen başka görev tarafından kilitli"
        )

    lock = db.create_file_lock(
        team_id=team_id,
        file_path=file_path,
        run_id=proposal.get("run_id"),
        task_id=proposal.get("task_id"),
        member_id=proposal.get("member_id"),
    )

    fpath = project_dir / file_path
    try:
        fpath.resolve().relative_to(project_dir.resolve())
    except ValueError:
        if lock:
            db.release_file_lock(lock["id"])
        raise HTTPException(status_code=403, detail="Geçersiz dosya yolu")

    fpath.parent.mkdir(parents=True, exist_ok=True)
    status = "updated" if fpath.exists() else "added"
    fpath.write_text(proposal["content"], encoding="utf-8")
    auto_fix_index_html(project_dir)
    db.update_file_proposal_status(req.proposal_id, "applied")
    if lock:
        db.release_file_lock(lock["id"])

    return {
        "proposal_id": req.proposal_id,
        "status": "applied",
        "file_status": status,
        "path": file_path,
    }


@router.post("/{team_id}/proposals/reject")
async def reject_file_proposal(
    team_id: str,
    req: ProposalActionRequest,
    current_user: dict = Depends(get_current_user),
):
    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    proposal = db.get_file_proposal(req.proposal_id)
    if not proposal or proposal.get("team_id") != team_id:
        raise HTTPException(status_code=404, detail="Proposal bulunamadı")
    if proposal.get("status") in ("applied", "rejected"):
        raise HTTPException(status_code=400, detail="Proposal zaten işlenmiş")

    db.update_file_proposal_status(req.proposal_id, "rejected")
    return {"proposal_id": req.proposal_id, "status": "rejected"}


@router.get("/{team_id}/download")
async def download_project_zip(
    team_id: str, current_user: dict = Depends(get_current_user)
):
    """Proje dosyalarını ZIP olarak indir"""
    import zipfile
    import io

    team = db.get_team(team_id)
    if not team:
        raise HTTPException(status_code=404, detail="Takım bulunamadı")
    if team["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Erişim yok")

    project_dir = get_project_dir(team_id)
    files = list(project_dir.rglob("*"))
    files = [f for f in files if f.is_file()]

    if not files:
        raise HTTPException(status_code=404, detail="Projede dosya yok")

    buf = io.BytesIO()
    team_name = team.get("name", "project").replace(" ", "_")
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            arcname = f"{team_name}/{f.relative_to(project_dir).as_posix()}"
            zf.write(f, arcname)
    buf.seek(0)

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{team_name}.zip"'},
    )
