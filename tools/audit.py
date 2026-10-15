#!/usr/bin/env python3
"""
World-safety audit for Procedural Magic Items (foundry-pmi).

Finds every line in scripts/ (recursively) that can change world data or global behaviour (document writes,
deletions, settings, permissions, sockets, wrappers, hooks, network/file access) and compares
them with the reviewed list in tools/audit-reviewed.txt.

    python3 tools/audit.py            # report; exits 1 if any site is new/changed (unreviewed)
    python3 tools/audit.py --accept   # after reviewing every site against CLAUDE.md, record them

A line is identified by its file and its code (not its line number), so moving code around
doesn't trigger a re-review, but changing what a write does does.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REVIEWED = ROOT / "tools" / "audit-reviewed.txt"

# (category, pattern). Ordered: the first match names the category.
PATTERNS = [
    ("DELETE",      r"\.delete\(|deleteDocuments|deleteEmbeddedDocuments|\.-=|unsetFlag"),
    ("PERMISSION",  r"ownership|permission|testUserPermission|\.role\b"),
    ("SETTING",     r"settings\.(set|register)"),
    ("CREATE",      r"\.create\(|createDocuments|createEmbeddedDocuments"),
    ("UPDATE",      r"\.update\(|updateDocuments|updateEmbeddedDocuments|setFlag|updateSource"),
    ("WRAP/HOOK",   r"libWrapper\.register|Hooks\.(on|once)\(|CONFIG\.[A-Za-z.]+\s*=|\.prototype\.[A-Za-z]+\s*="),
    ("SOCKET",      r"socket\.(on|emit)"),
    ("GLOBAL",      r"document\.addEventListener|window\.|globalThis\.|CONFIG\.TextEditor\.enrichers"),
    ("FILE/NET",    r"fetch\(|XMLHttpRequest|FilePicker\.upload|\bimport\(|game\.world\.|indexedDB|localStorage"),
]

def scan():
    sites = []
    for f in sorted((ROOT / "scripts").rglob("*.mjs")):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            code = line.strip()
            if not code or code.startswith("//") or code.startswith("*") or code.startswith("/*"):
                continue
            for cat, pat in PATTERNS:
                if re.search(pat, code):
                    sites.append((cat, f.relative_to(ROOT / "scripts").as_posix(), n, code))
                    break
    return sites

def key(cat, fname, code):
    return f"{cat}\t{fname}\t{re.sub(r'\\s+', ' ', code)}"

def main():
    sites = scan()
    current = {key(c, f, code): (c, f, n, code) for c, f, n, code in sites}
    reviewed = set()
    if REVIEWED.exists():
        reviewed = {l for l in REVIEWED.read_text(encoding="utf-8").splitlines() if l and not l.startswith("#")}

    if "--accept" in sys.argv:
        header = ("# PMI world-safety audit: every reviewed site that can change world data or global behaviour.\n"
                  "# Regenerate ONLY after reviewing each new/changed site against the checklist in CLAUDE.md:\n"
                  "#   python3 tools/audit.py --accept\n")
        REVIEWED.write_text(header + "\n".join(sorted(current)) + "\n", encoding="utf-8")
        print(f"Recorded {len(current)} reviewed sites in {REVIEWED.relative_to(ROOT)}.")
        return 0

    new = sorted(k for k in current if k not in reviewed)
    gone = sorted(k for k in reviewed if k not in current)
    by_cat = {}
    for c, f, n, code in sites:
        by_cat.setdefault(c, []).append((f, n, code))
    print(f"World-safety audit: {len(sites)} sites in scripts/\n")
    for cat, _ in PATTERNS:
        if cat in by_cat:
            print(f"{cat} ({len(by_cat[cat])})")
            for f, n, code in by_cat[cat]:
                mark = "  NEW " if key(cat, f, code) in new else "      "
                print(f"{mark}{f}:{n}: {code[:150]}")
            print()
    if gone:
        print(f"{len(gone)} previously reviewed site(s) no longer present (removed or changed):")
        for k in gone:
            print("   - " + k.replace("\t", " | ")[:170])
        print()
    if new:
        print(f"✗ {len(new)} UNREVIEWED site(s) marked NEW. Review each against the checklist in CLAUDE.md, "
              f"then run: python3 tools/audit.py --accept")
        return 1
    print("✓ All sites match the reviewed list." + (" (Some reviewed sites were removed; run --accept to tidy the list.)" if gone else ""))
    return 0

if __name__ == "__main__":
    sys.exit(main())
