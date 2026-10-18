#!/usr/bin/env python3
"""
Build Procedural Magic Items: module.json and dist/foundry-pmi.zip.

    python3 tools/build.py --repo OWNER/REPO [--version 1.0.0] [--branch main]

module.json is generated here so the manifest, download URL and version always agree.
"""
import argparse, json, re, sys, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MODULE_ID = "foundry-pmi"
CORE_MIN, CORE_VERIFIED = "12", "12.331"
SYSTEM_MIN, SYSTEM_VERIFIED, SYSTEM_MAX = "4.4.0", "4.4.4", "4.4.99"
RELEASE_DIRS = ["scripts", "templates", "styles", "lang", "data"]
RELEASE_FILES = ["module.json", "README.md", "LICENSE"]


def current_version():
    p = ROOT / "module.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8")).get("version", "0.1.0")
    return "0.1.0"


def manifest(owner, repo, version, branch):
    return {
        "id": MODULE_ID,
        "title": "Procedural Magic Items",
        "description": "A DM-guided builder for procedurally generated D&D 5e magic items with real mechanical effects: "
                       "native activities, Active Effects and charges, reviewed by the DM before players see them.",
        "version": version,
        "authors": [{"name": owner, "url": f"https://github.com/{owner}"}],
        "compatibility": {"minimum": CORE_MIN, "verified": CORE_VERIFIED, "maximum": "12"},
        "relationships": {
            "systems": [{"id": "dnd5e", "type": "system",
                         "compatibility": {"minimum": SYSTEM_MIN, "verified": SYSTEM_VERIFIED, "maximum": SYSTEM_MAX}}],
            "requires": [{"id": "lib-wrapper", "type": "module",
                          "manifest": "https://github.com/ruipin/fvtt-lib-wrapper/releases/latest/download/module.json",
                          "compatibility": {"minimum": "1.12.0"}}],
        },
        "esmodules": ["scripts/main.mjs"],
        "styles": ["styles/pmi.css"],
        "languages": [{"lang": "en", "name": "English", "path": "lang/en.json"}],
        "url": f"https://github.com/{owner}/{repo}",
        "manifest": f"https://raw.githubusercontent.com/{owner}/{repo}/{branch}/module.json",
        "download": f"https://github.com/{owner}/{repo}/raw/{branch}/dist/{MODULE_ID}.zip",
        "readme": f"https://github.com/{owner}/{repo}#readme",
        "bugs": f"https://github.com/{owner}/{repo}/issues",
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--repo", required=True, help="OWNER/REPO")
    ap.add_argument("--version", default=None)
    ap.add_argument("--branch", default="main")
    args = ap.parse_args()
    owner, repo = args.repo.split("/", 1)
    version = args.version or current_version()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        sys.exit(f"Version must be X.Y.Z, got {version!r}")

    # Every file the manifest points at must exist.
    m = manifest(owner, repo, version, args.branch)
    for rel in m["esmodules"] + m["styles"] + [l["path"] for l in m["languages"]]:
        if not (ROOT / rel).exists():
            sys.exit(f"module.json references a missing file: {rel}")
    (ROOT / "module.json").write_text(json.dumps(m, indent=2) + "\n", encoding="utf-8")

    # Stamp the version into the stylesheet, so PMI can tell when a browser is using a stale cached copy.
    css_path = ROOT / "styles" / "pmi.css"
    css = css_path.read_text(encoding="utf-8")
    stamped, n = re.subn(r'--pmi-css-version:\s*"[^"]*"', f'--pmi-css-version: "{version}"', css)
    if n != 1:
        sys.exit("styles/pmi.css must contain exactly one --pmi-css-version declaration")
    css_path.write_text(stamped, encoding="utf-8")

    # And into the trigger runtime: a browser can cache old scripts too, and stale triggers fail silently.
    rt_path = ROOT / "scripts" / "runtime" / "triggers.mjs"
    rt = rt_path.read_text(encoding="utf-8")
    stamped, n = re.subn(r'export const RUNTIME_VERSION = "[^"]*";', f'export const RUNTIME_VERSION = "{version}";', rt)
    if n != 1:
        sys.exit("scripts/runtime/triggers.mjs must contain exactly one RUNTIME_VERSION declaration")
    rt_path.write_text(stamped, encoding="utf-8")

    # Release zip: only what Foundry needs, with module.json at the top level.
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    zpath = dist / f"{MODULE_ID}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in RELEASE_FILES:
            if (ROOT / rel).exists():
                z.write(ROOT / rel, rel)
        for d in RELEASE_DIRS:
            for f in sorted((ROOT / d).rglob("*")):
                if f.is_file():
                    z.write(f, f.relative_to(ROOT).as_posix())
    print(f"Built {MODULE_ID} {version}: module.json and {zpath.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
