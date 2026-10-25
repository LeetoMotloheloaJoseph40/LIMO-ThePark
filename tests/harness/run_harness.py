#!/usr/bin/env python3
"""Dependency-free structural checker for the LIMO-ThePark test manifest."""
import argparse
import json
import sys
from pathlib import Path

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    root = args.root.resolve()
    manifest_path = root / "tests" / "harness" / "test_manifest.json"

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: cannot read valid manifest: {exc}", file=sys.stderr)
        return 1

    if manifest.get("schema_version") != 1:
        print("FAIL: unsupported or missing schema_version", file=sys.stderr)
        return 1
    if not isinstance(manifest.get("programs"), list) or not isinstance(manifest.get("hazard_cases"), list):
        print("FAIL: programs and hazard_cases must be lists", file=sys.stderr)
        return 1

    failures = 0
    print("Checking sample program files...")
    for program in manifest["programs"]:
        rel = program.get("file", "")
        target = (root / rel).resolve()
        if not rel or root not in target.parents:
            print(f"FAIL: invalid path for {program.get('id', '?')}: {rel}")
            failures += 1
        elif target.is_file():
            print(f"PASS: {program.get('id', '?')} file exists: {rel}")
        else:
            print(f"FAIL: missing sample file: {rel}")
            failures += 1

    print(f"Checking hazard-case metadata ({len(manifest['hazard_cases'])} cases)...")
    seen = set()
    for case in manifest["hazard_cases"]:
        cid = case.get("id")
        if not cid or cid in seen or not case.get("name") or not case.get("expected"):
            print(f"FAIL: invalid or duplicate hazard case: {case}")
            failures += 1
        else:
            seen.add(cid)
            print(f"PASS: {cid} — {case['name']}")

    print("\nSIMULATOR EXECUTION: NOT RUN")
    print("This scaffold checks file presence and manifest structure only.")
    print("Program results and pipeline behaviour still require the team's simulator/CLI.")
    if failures:
        print(f"\nRESULT: FAIL — {failures} scaffold check(s) failed.")
        return 1
    print("\nRESULT: PASS — scaffold checks passed; simulator tests are not yet integrated.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
