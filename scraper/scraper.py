#!/usr/bin/env python3
import json
import os
import time
import urllib.request
import urllib.parse
import urllib.error
import sys
import re

BASE_URL = "https://venezuelatebusca.com"
API_PERSONS = f"{BASE_URL}/api/persons"
API_STATS = f"{BASE_URL}/api/stats"
OUTPUT_DIR = "data"
PAGE_SIZE = 200
DELAY = 0.3


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "VTB-Scraper/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read())
        link_header = resp.headers.get("Link", "")
        return data, link_header


def extract_next_url(link_header):
    m = re.search(r'<([^>]+)>;\s*rel="next"', link_header)
    return m.group(1) if m else None


def fetch_all_persons():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    all_persons = []
    url = f"{API_PERSONS}?limit={PAGE_SIZE}"
    page = 1

    while url:
        print(f"  Pagina {page}...", end=" ", flush=True)
        try:
            data, link_header = fetch_json(url)
            persons = data.get("persons", [])
            print(f"{len(persons)} personas")
            all_persons.extend(persons)

            batch_file = os.path.join(OUTPUT_DIR, f"persons_batch_{page:04d}.json")
            with open(batch_file, "w", encoding="utf-8") as f:
                json.dump(persons, f, ensure_ascii=False, indent=2)

            url = extract_next_url(link_header)
            page += 1
            time.sleep(DELAY)
        except Exception as e:
            print(f"ERROR: {e}")
            break

    return all_persons


def fetch_stats():
    print("Descargando estadisticas...")
    data, _ = fetch_json(API_STATS)
    with open(os.path.join(OUTPUT_DIR, "stats.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  Stats: {data}")
    return data


def build_aggregated(persons):
    return {
        "total": len(persons),
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "source": BASE_URL,
        "persons": persons,
    }


def main():
    print("=== VENEZUELA TE BUSCA - SCRAPER ===")
    print()
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    stats = fetch_stats()
    print()

    print("Descargando todas las personas...")
    all_persons = fetch_all_persons()
    print(f"\nTotal descargado: {len(all_persons)} personas")
    print()

    aggregated = build_aggregated(all_persons)
    master_file = os.path.join(OUTPUT_DIR, "persons_full.json")
    with open(master_file, "w", encoding="utf-8") as f:
        json.dump(aggregated, f, ensure_ascii=False, indent=2)
    print(f"Archivo completo: {master_file} ({os.path.getsize(master_file) / 1024 / 1024:.1f} MB)")

    print()
    print("=== FIN ===")


if __name__ == "__main__":
    main()
