"""Build the bundled GM guide from guide-source.json, without calling Foundry or AI."""

import argparse
import html
import json
import os
from pathlib import Path


MODULE_ROOT = Path(__file__).resolve().parents[1]
GUIDE_ROOT = MODULE_ROOT / "src" / "guide"
SOURCE_PATH = GUIDE_ROOT / "guide-source.json"

CSS = """
.forge-guide-document { color-scheme: light; font-family: "Microsoft YaHei", "Noto Sans SC", sans-serif; color: #25302c; background: #faf9f6; margin: 0; font-size: 16px; line-height: 1.8; overflow: auto; min-height: 0; scrollbar-color: #87978d #eeeee7; }
.forge-guide-document, .forge-guide-document * { box-sizing: border-box; }
.forge-guide-document a { color: #285b49; text-underline-offset: .2em; }
.forge-guide-document a:hover { color: #153d2e; }
.forge-guide-document a:focus-visible { outline: 2px solid #285b49; outline-offset: 4px; }
.forge-guide-document ::selection { color: #132c21; background: #d6e8da; }
.forge-guide-document .layout { display: grid; grid-template-columns: 13.5rem minmax(0, 1fr); min-height: 100%; }
.forge-guide-document .sidebar { position: sticky; top: 0; align-self: start; padding: 2rem 1.4rem; background: #eeeee7; }
.forge-guide-document .sidebar strong { display: block; margin-bottom: 1rem; font-size: 1.05rem; }
.forge-guide-document .sidebar nav { display: grid; gap: .75rem; }
.forge-guide-document .sidebar nav a { text-decoration: none; }
.forge-guide-document .sidebar nav a:hover { text-decoration: underline; }
.forge-guide-document .sidebar .pdf-link { display: block; margin-top: 2rem; }
.forge-guide-document main { width: min(100%, 56rem); min-width: 0; padding: 2.4rem 3rem 4rem; }
.forge-guide-document h1, .forge-guide-document h2, .forge-guide-document h3 { font-family: inherit; color: inherit; text-shadow: none; border: 0; }
.forge-guide-document h1 { font-size: 2rem; line-height: 1.3; margin: 0 0 .6rem; }
.forge-guide-document h2 { font-size: 1.6rem; line-height: 1.4; margin: 0 0 .6rem; }
.forge-guide-document h3 { font-size: 1.08rem; line-height: 1.5; margin: 1.75rem 0 .5rem; }
.forge-guide-document p { margin: .6rem 0; max-width: 42rem; }
.forge-guide-document .intro { color: #4f5d56; }
.forge-guide-document .flow { margin: 1.2rem 0 2rem; padding: .8rem 0; border-block: 1px solid #d7dcd4; font-weight: 600; }
.forge-guide-document section.chapter { margin-top: 3.5rem; scroll-margin-top: 1.5rem; }
.forge-guide-document .chapter-lead { color: #4f5d56; }
.forge-guide-document ol { padding-left: 1.6rem; margin: .6rem 0 1rem; }
.forge-guide-document li { padding-left: .2rem; margin: .6rem 0; }
.forge-guide-document .table-wrap { overflow-x: auto; }
.forge-guide-document table { width: 100%; border-collapse: collapse; margin: .8rem 0 1.2rem; font-size: .94rem; background: #faf9f6; color: #25302c; }
.forge-guide-document tbody, .forge-guide-document tr, .forge-guide-document td, .forge-guide-document tbody tr:nth-child(odd), .forge-guide-document tbody tr:nth-child(even) { background: #faf9f6; color: #25302c; }
.forge-guide-document th, .forge-guide-document td { text-align: left; vertical-align: top; padding: .65rem .7rem; border-bottom: 1px solid #d7dcd4; }
.forge-guide-document th { background: #eeeee7; color: #25302c; font-weight: 600; }
.forge-guide-document td:first-child { min-width: 7rem; }
.forge-guide-document .downloads { display: flex; flex-wrap: wrap; gap: .35rem 1.2rem; margin: .8rem 0; }
.forge-guide-document figure { margin: 1.5rem 0 2rem; }
.forge-guide-document figure a { display: block; }
.forge-guide-document figure img { width: 100%; height: auto; display: block; border: 1px solid #d7dcd4; }
.forge-guide-document figcaption { color: #4f5d56; font-size: .9rem; margin-top: .55rem; }
.forge-guide-document footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid #d7dcd4; color: #4f5d56; font-size: .9rem; }
@media (max-width: 760px) {
  .forge-guide-document .layout { display: block; }
  .forge-guide-document .sidebar { position: static; padding: 1.1rem 1.3rem; }
  .forge-guide-document .sidebar strong { margin-bottom: .5rem; }
  .forge-guide-document .sidebar nav { display: flex; flex-wrap: wrap; gap: .35rem 1.1rem; }
  .forge-guide-document .sidebar .pdf-link { margin-top: .65rem; }
  .forge-guide-document main { padding: 1.8rem 1.3rem 3rem; }
  .forge-guide-document h1 { font-size: 1.75rem; }
  .forge-guide-document section.chapter { margin-top: 2.5rem; }
}
@media print {
  .forge-guide-document .layout { display: block; }
  .forge-guide-document .sidebar { display: none; }
  .forge-guide-document main { padding: 0; width: 100%; }
  .forge-guide-document section.chapter { break-before: page; }
  .forge-guide-document figure, .forge-guide-document tr { break-inside: avoid; }
}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--html-only", action="store_true", help="Regenerate HTML without the PDF dependency.")
    parser.add_argument("--font", type=Path, help="A TrueType font containing Chinese glyphs.")
    args = parser.parse_args()
    source = json.loads(SOURCE_PATH.read_text(encoding="utf-8"))
    validate_assets(source)
    (GUIDE_ROOT / "index.html").write_text(render_html(source), encoding="utf-8", newline="\n")
    if not args.html_only:
        build_pdf(source, args.font)
    print("Generated index.html" + (" and guide.pdf" if not args.html_only else ""))


def validate_assets(source):
    for download in source["downloads"]:
        if download["file"] != "guide.pdf" and not (GUIDE_ROOT / download["file"]).is_file():
            raise FileNotFoundError(download["file"])
    for chapter in source["chapters"]:
        for picture in chapter["images"]:
            if not picture["file"].startswith("images/") or not (GUIDE_ROOT / picture["file"]).is_file():
                raise FileNotFoundError(picture["file"])


def download_links(source):
    return '<div class="downloads">' + "".join(
        f'<a href="{html.escape(item["file"])}" download>{html.escape(item["label"])}</a>'
        for item in source["downloads"]
    ) + "</div>"


def render_html(source):
    title = html.escape(source["title"])
    navigation = "".join(
        f'<a href="#{chapter["id"]}">{html.escape(chapter["title"])}</a>'
        for chapter in source["chapters"]
    )
    chapters = []
    for chapter in source["chapters"]:
        parts = [f'<section class="chapter" id="{chapter["id"]}"><h2>{html.escape(chapter["title"])}</h2>',
                 f'<p class="chapter-lead">{html.escape(chapter["lead"])}</p>']
        for block in chapter["blocks"]:
            parts.append(f'<h3>{html.escape(block["heading"])}</h3>')
            parts.extend(f'<p>{html.escape(paragraph)}</p>' for paragraph in block.get("paragraphs", []))
            if "steps" in block:
                parts.append("<ol>" + "".join(f"<li>{html.escape(step)}</li>" for step in block["steps"]) + "</ol>")
            if "rows" in block:
                rows = block["rows"]
                header = "".join(f'<th scope="col">{html.escape(cell)}</th>' for cell in rows[0])
                body = "".join("<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>" for row in rows[1:])
                parts.append(f'<div class="table-wrap"><table><thead><tr>{header}</tr></thead><tbody>{body}</tbody></table></div>')
            if block.get("downloads"):
                parts.append(download_links(source))
        for picture in chapter["images"]:
            file = html.escape(picture["file"])
            parts.append(f'<figure><a href="{file}" download aria-label="下载界面图片"><img src="{file}" alt="{html.escape(picture["alt"])}" loading="lazy"></a><figcaption>{html.escape(picture["caption"])}</figcaption></figure>')
        parts.append("</section>")
        chapters.append("\n".join(parts))
    return f'''<!doctype html>
<!-- Generated by scripts/build-guide.py from guide-source.json. -->
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><style id="forge-guide-styles">{CSS}</style></head>
<body class="forge-guide-document"><div class="layout" id="forge-guide-content"><aside class="sidebar"><strong>{title}</strong><nav aria-label="手册目录">{navigation}</nav><a class="pdf-link" href="guide.pdf" download>下载 PDF 手册</a></aside>
<main><header><h1>{title}</h1><p class="intro">{html.escape(source["description"])}</p><p class="flow">{" → ".join(html.escape(step) for step in source["flow"])}</p></header>
{"".join(chapters)}
<footer>打开手册不会改动当前资料或世界中的卡片。</footer></main></div></body></html>
'''


def build_pdf(source, font_path):
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_LEFT
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    candidates = [font_path, Path(os.environ.get("FORGE_GUIDE_FONT", "")), Path("C:/Windows/Fonts/simhei.ttf")]
    selected_font = next((candidate for candidate in candidates if candidate and candidate.is_file()), None)
    font_name = "ForgeGuideChinese"
    if selected_font:
        pdfmetrics.registerFont(TTFont(font_name, str(selected_font)))
    else:
        font_name = "STSong-Light"
        pdfmetrics.registerFont(UnicodeCIDFont(font_name))

    ink, muted, line, paper = [colors.HexColor(value) for value in ["#25302c", "#4f5d56", "#d7dcd4", "#eeeee7"]]
    styles = getSampleStyleSheet()
    base = dict(fontName=font_name, textColor=ink, wordWrap="CJK", alignment=TA_LEFT)
    styles.add(ParagraphStyle(name="GuideTitle", fontSize=25, leading=34, spaceAfter=10, **base))
    styles.add(ParagraphStyle(name="GuideChapter", fontSize=20, leading=28, spaceAfter=9, **base))
    styles.add(ParagraphStyle(name="GuideHeading", fontSize=12, leading=18, spaceBefore=13, spaceAfter=5, keepWithNext=True, **base))
    styles.add(ParagraphStyle(name="GuideBody", fontSize=10.5, leading=17, spaceAfter=7, **base))
    styles.add(ParagraphStyle(name="GuideLead", fontSize=10.5, leading=17, spaceAfter=12, **{**base, "textColor": muted}))
    styles.add(ParagraphStyle(name="GuideCell", fontSize=9, leading=14, **base))
    styles.add(ParagraphStyle(name="GuideCaption", fontSize=9, leading=14, spaceBefore=6, spaceAfter=10, **{**base, "textColor": muted}))
    width = A4[0] - 88
    story = []
    for index, chapter in enumerate(source["chapters"]):
        if index:
            story.append(PageBreak())
        else:
            story.extend([Paragraph(html.escape(source["title"]), styles["GuideTitle"]),
                          Paragraph(html.escape(source["description"]), styles["GuideLead"]),
                          Paragraph(" → ".join(source["flow"]), styles["GuideBody"]), Spacer(1, 16)])
        story.extend([Paragraph(html.escape(chapter["title"]), styles["GuideChapter"]),
                      Paragraph(html.escape(chapter["lead"]), styles["GuideLead"])])
        for block in chapter["blocks"]:
            story.append(Paragraph(html.escape(block["heading"]), styles["GuideHeading"]))
            story.extend(Paragraph(html.escape(paragraph), styles["GuideBody"]) for paragraph in block.get("paragraphs", []))
            for number, step in enumerate(block.get("steps", []), 1):
                story.append(Paragraph(f"{number}. {html.escape(step)}", styles["GuideBody"]))
            if "rows" in block:
                rows = [[Paragraph(html.escape(cell), styles["GuideCell"]) for cell in row] for row in block["rows"]]
                widths = [width * .24, width * .76] if len(rows[0]) == 2 else [width * .25, width * .33, width * .42]
                table = Table(rows, colWidths=widths, repeatRows=1, hAlign="LEFT")
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), paper),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 8),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LINEBELOW", (0, 0), (-1, -1), .5, line),
                ]))
                story.extend([table, Spacer(1, 6)])
            if block.get("downloads"):
                story.append(Paragraph("HTML 手册中提供以上资料的下载链接。", styles["GuideBody"]))
        for picture in chapter["images"]:
            image = Image(str(GUIDE_ROOT / picture["file"]))
            scale = min(width / image.imageWidth, 560 / image.imageHeight)
            image.drawWidth, image.drawHeight = image.imageWidth * scale, image.imageHeight * scale
            image.hAlign = "LEFT"
            story.append(KeepTogether([Spacer(1, 10), image, Paragraph(html.escape(picture["caption"]), styles["GuideCaption"])]))

    def page_footer(canvas, document):
        canvas.setTitle(source["title"])
        canvas.setAuthor("Forge")
        canvas.setStrokeColor(line)
        canvas.line(44, 39, A4[0] - 44, 39)
        canvas.setFont(font_name, 8)
        canvas.setFillColor(muted)
        canvas.drawString(44, 25, source["title"])
        canvas.drawRightString(A4[0] - 44, 25, str(document.page))

    document = SimpleDocTemplate(str(GUIDE_ROOT / "guide.pdf"), pagesize=A4, leftMargin=44, rightMargin=44,
                                 topMargin=42, bottomMargin=52, title=source["title"], author="Forge")
    document.build(story, onFirstPage=page_footer, onLaterPages=page_footer)


if __name__ == "__main__":
    main()
