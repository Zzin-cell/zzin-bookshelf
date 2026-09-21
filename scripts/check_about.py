import json
with open(r"C:\Users\MR\.minimax\sessions\mvs_206f11fda65244cbb781e812c97d3ef2\workspace\weread-bookshelf\public\data\about.json", encoding="utf-8") as f:
    d = json.load(f)
print("keys:", list(d.keys()))
print("bio_long len:", len(d.get("bio_long") or ""))
print("intro len:", len(d.get("intro") or ""))
print("bio_long:", repr(d.get("bio_long"))[:200])
print("intro:", repr(d.get("intro"))[:200])