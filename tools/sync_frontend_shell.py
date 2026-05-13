"""Synchronize shared Raiko shell markup across multi-page frontend entries.

This project is migrating from one large `frontend/index.html` SPA to many
page-specific HTML entries. During the migration, the top navbar, footer,
pricing modal, upload overlay, and gallery modals are still duplicated in each
HTML file for runtime safety.

Use this script after changing shared shell markup in `frontend/index.html`.
It preserves each page's own `<section class="panel ...">...</section>` content
and refreshes the shared shell around it.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "frontend"
SOURCE = FRONTEND / "index.html"


@dataclass(frozen=True)
class PageConfig:
    filename: str
    panel: str
    title: str


PAGES: tuple[PageConfig, ...] = (
    PageConfig("explore-gallery.html", "explore-gallery", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("image.html", "image", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("video.html", "video", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("upscale.html", "upscale", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("edit.html", "edit", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("expand.html", "expand", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("restyler.html", "restyler", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("angles.html", "angles", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("shots.html", "shots", "Raiko AI: Professional Video & Image Gen."),
    PageConfig("media.html", "media", "Raiko AI: Professional Video & Image Gen."),
)

NAV_ACTIVE_PANELS = {
    "explore-gallery": "dashboard",
    "image": "image",
    "video": "video",
    "upscale": "edit",
    "edit": "edit",
    "expand": "image",
    "restyler": "restyler",
    "angles": "image",
    "shots": "image",
    "media": "",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def main_open_end(text: str) -> int:
    marker = '  <main class="main-area" id="main-area">'
    return text.index("\n", text.index(marker)) + 1


def footer_start(text: str) -> int:
    footer = text.find('    <footer class="site-footer"')
    if footer != -1:
        return footer
    return main_close_start(text, main_open_end(text))


def main_close_start(text: str, start: int) -> int:
    return text.index("  </main>", start)


def page_panel_block(text: str) -> str:
    start = main_open_end(text)
    end = footer_start(text)
    return text[start:end].strip("\n") + "\n"


def with_page_metadata(shell_head: str, config: PageConfig) -> str:
    result = shell_head
    result = result.replace(
        "<title>Raiko AI: Professional Video & Image Gen.</title>",
        f"<title>{config.title}</title>",
    )
    result = result.replace(
        '<meta name="description" content="Raiko AI: Professional video and image generation with advanced creative apps and workflows." />',
        '<meta name="description" content="Raiko AI: Professional video and image generation with advanced creative apps and workflows." />',
    )
    if '<body data-page=' in result:
        result = result.replace(
            result[result.index('<body data-page='):result.index('>', result.index('<body data-page=')) + 1],
            f'<body data-page="{config.panel}">',
            1,
        )
    else:
        result = result.replace("<body>", f'<body data-page="{config.panel}">', 1)
    return result


def with_active_nav(shell: str, panel: str) -> str:
    active_panel = NAV_ACTIVE_PANELS.get(panel, panel)
    shell = shell.replace('class="nav-item active"', 'class="nav-item"')
    if active_panel:
        shell = shell.replace(
            f'class="nav-item" data-panel="{active_panel}"',
            f'class="nav-item active" data-panel="{active_panel}"',
            1,
        )
    return shell


def sync_page(source_text: str, config: PageConfig) -> None:
    target = FRONTEND / config.filename
    target_text = read(target)

    shell_head = source_text[:main_open_end(source_text)]
    shell_head = with_active_nav(shell_head, config.panel)
    shell_tail = source_text[main_close_start(source_text, footer_start(source_text)):]
    panel = page_panel_block(target_text)

    next_text = with_page_metadata(shell_head, config) + panel + "\n" + shell_tail
    write(target, next_text)
    print(f"synced {target.relative_to(ROOT)}")


def main() -> None:
    source_text = read(SOURCE)
    for config in PAGES:
        sync_page(source_text, config)


if __name__ == "__main__":
    main()
