#!/usr/bin/env python3
"""Rewrites the old permission names a product's code passes (can(v, "X"), run("X"), run(["X"]), perm/permission: "X", ForbiddenError("X"), plain "X" tokens in
actions/exports) to micro feature keys. Usage: scripts/micro-convert.py <config.json>
config: {"roots": [...], "skip": ["path suffix"], "map": {"LEGACY": "module.feature"}, "overrides": [{"prefix": "path fragment", "map": {"LEGACY": "module.feature"}}]}"""
import json, re, glob, sys
cfg = json.load(open(sys.argv[1]))
tokens = sorted(cfg["map"], key=len, reverse=True)
n = 0
for root in cfg["roots"]:
    for f in glob.glob(root + "/**/*.ts*", recursive=True):
        if any(f.endswith(x) for x in cfg.get("skip", [])): continue
        m = dict(cfg["map"])
        for o in cfg.get("overrides", []):
            if o["prefix"] in f: m.update(o["map"])
        s = open(f).read(); o_ = s
        for k in tokens:
            v = m[k]
            s = re.sub(r'\b(can\(\s*\w+\s*,\s*)"%s"' % k, lambda mm: mm.group(1) + '"%s"' % v, s)
            s = re.sub(r'\b(run\(\s*\[?\s*)"%s"' % k, lambda mm: mm.group(1) + '"%s"' % v, s)
            s = re.sub(r'\b(permissions?: \[?\s*)"%s"' % k, lambda mm: mm.group(1) + '"%s"' % v, s)
            s = re.sub(r'\b(perm: )"%s"' % k, lambda mm: mm.group(1) + '"%s"' % v, s)
            s = re.sub(r'\bForbiddenError\("%s"\)' % k, 'ForbiddenError("%s")' % v, s)
            s = re.sub(r'(, )"%s"(\s*[\],])' % k, lambda mm: mm.group(1) + '"%s"' % v + mm.group(2), s) if cfg.get("loose") else s
        if s != o_: open(f, "w").write(s); n += 1
print("files changed:", n)
