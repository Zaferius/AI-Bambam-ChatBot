from pathlib import Path


ROOT = Path("frontend")
SOURCE = ROOT / "styles.css"
OUT = ROOT / "css"


def main() -> None:
    text = SOURCE.read_text(encoding="utf-8")
    markers = [
        ("app-shell", "/* ════════════════════════════════════════════════════════\n   APP SHELL"),
        ("content-machine", "/* ── Navbar Mega Dropdown ── */"),
        ("shell", "/* ════════════════════════════════════════════════════════\n   SIDEBAR"),
        ("legacy-chat", "/* ════════════════════════════════════════════════════════\n   DASHBOARD PANEL"),
        ("explore", "/* ════════════════════════════════════════════════════════\n   IMAGE TOOLS SUITE"),
        ("image-tools", "/* Right: info */"),
        ("gallery-modal", "/* ════════════════════════════════════════════════════════\n   IMAGE / VIDEO PANELS"),
        ("image", "/* ════════════════════════════════════════════════════════\n   GENERIC PANEL / FORM ELEMENTS"),
        ("shared-ui", "/* ════════════════════════════════════════════════════════\n   MY MEDIA PANEL"),
        ("media", "/* ── Footer"),
        ("footer-responsive", "/* ════════════════════════════════════════════════════════\n   VIDEO PANEL"),
        ("video", "/* ── Section Label"),
        ("image-controls", "/* ═══════════════════════════════════════════════════════════\n   EDIT PANEL"),
        ("edit-upscale", "/* ═══════════════════════════════════════════════════════════\n   IMAGE RESTYLER PANEL"),
    ]

    positions = []
    for name, marker in markers:
        idx = text.find(marker)
        if idx < 0:
            raise RuntimeError(f"Marker not found for {name}: {marker!r}")
        positions.append((name, idx))

    sections = [("base", text[: positions[0][1]].rstrip() + "\n")]
    for i, (name, idx) in enumerate(positions):
        end = positions[i + 1][1] if i + 1 < len(positions) else len(text)
        sections.append((name, text[idx:end].rstrip() + "\n"))

    OUT.mkdir(exist_ok=True)
    written = []
    for name, content in sections:
        if content.strip():
            file_name = f"{name}.css"
            (OUT / file_name).write_text(content, encoding="utf-8")
            written.append(file_name)

    main_css = "/* Raiko CSS modules — split from the former monolithic frontend/styles.css. Keep import order stable. */\n"
    main_css += "\n".join(f'@import url("./{file_name}");' for file_name in written)
    main_css += "\n"
    (OUT / "main.css").write_text(main_css, encoding="utf-8")

    SOURCE.write_text(
        "/* Raiko CSS entry moved to frontend/css/main.css. Kept for legacy links. */\n"
        '@import url("./css/main.css");\n',
        encoding="utf-8",
    )

    for html in ROOT.glob("*.html"):
        page = html.read_text(encoding="utf-8")
        page = page.replace('href="styles.css?v=20260425d"', 'href="css/main.css?v=20260513a"')
        html.write_text(page, encoding="utf-8")

    print("Wrote CSS modules:", ", ".join(written))


if __name__ == "__main__":
    main()
