from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

from common import REPO_ROOT

SCRIPT_DIR = Path(__file__).resolve().parent


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Farmhani data pipeline end to end.")
    parser.add_argument("--collect-web", action="store_true", help="Fetch public web pages from source registry.")
    parser.add_argument("--collect-ncpms-guide", action="store_true", help="Fetch NCPMS OpenAPI guide page.")
    parser.add_argument("--collect-psis", action="store_true", help="Call PSIS API. Requires PSIS_API_KEY.")
    parser.add_argument("--psis-crop", help="Crop name for PSIS collection.")
    parser.add_argument("--psis-pest", help="Disease/pest/weed name for PSIS collection.")
    parser.add_argument("--embed", action="store_true", help="Create embeddings after chunking.")
    parser.add_argument("--embed-mode", choices=["openai", "hash"], default="openai")
    parser.add_argument("--load-supabase", action="store_true", help="Load embedded chunks into Supabase pgvector.")
    parser.add_argument("--replace", action="store_true", help="Replace loaded source chunks in Supabase.")
    return parser.parse_args()


def run(script: str, *args: str) -> None:
    command = [sys.executable, str(SCRIPT_DIR / script), *args]
    print(f"\n$ {' '.join(command)}")
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def main() -> None:
    args = parse_args()

    if args.collect_web:
        run("collect_web_sources.py")

    if args.collect_ncpms_guide:
        run("collect_ncpms.py")

    if args.collect_psis:
        psis_args = []
        if args.psis_crop:
            psis_args.extend(["--crop", args.psis_crop])
        if args.psis_pest:
            psis_args.extend(["--pest", args.psis_pest])
        run("collect_psis.py", *psis_args)

    run("normalize_documents.py")
    run("chunk_documents.py")
    run("validate_processed_data.py", "--allow-missing")

    if args.embed:
        run("embed_chunks.py", "--mode", args.embed_mode)
        run("validate_processed_data.py")

    if args.load_supabase:
        load_args = ["--replace"] if args.replace else []
        run("load_supabase_pgvector.py", *load_args)


if __name__ == "__main__":
    main()
