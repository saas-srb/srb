#!/usr/bin/env python3
"""Regenerates src/lib/notify/center/seed-events.ts from the notification call sites (event key -> product, and the title/body wording found in the code).
Run from the repo root after adding a new notification type:  python3 scripts/gen-notification-catalog.py"""
import re, os

root = 'src'
callre = re.compile(r'\b(notify\w*|queuePush)\s*\(')
prod_by_dir = {'spendiq': 'prms', 'talentos': 'hrms', 'sprintos': 'pms', 'cohort-ai': 'tms', 'evaliq': 'ots', 'huddle-ai': 'messenger', 'playbook-ai': 'sop', 'rankmax-ai': 'seo', 'viralpulse-ai': 'smms', 'cybervault': 'dlms', 'agentos': 'aibots', 'clientos': 'portal', 'dealflow-ai': 'lms', 'sitecraft-ai': 'cms', 'cashflow-ai': 'fms', 'contractflow-ai': 'lpms', 'databrain-ai': 'intelligence'}
prefix_prod = {'sop': 'sop', 'dlms': 'dlms', 'aibots': 'aibots', 'smms': 'smms', 'ots': 'ots', 'seo': 'seo', 'expense': 'prms', 'po': 'prms', 'invoice': 'prms', 'requisition': 'prms', 'asset': 'prms', 'leave': 'hrms', 'payroll': 'hrms', 'task': 'pms', 'project': 'pms', 'timesheet': 'pms', 'milestone': 'pms', 'lead': 'lms', 'certificate': 'tms', 'enrollment': 'tms', 'assignment': 'tms', 'cms': 'cms', 'class': 'tms', 'employee': 'hrms', 'referral': 'cms', 'support': 'support', 'offer': 'cms', 'payment': 'workspace', 'manual': 'cms'}
SKIP = {'info', 'warning', 'error', 'success', 'string', 'number'}


def product_of(path, t):
    m = re.search(r'lib/products/([a-z-]+)/', path) or re.search(r'products\)/([a-z-]+)/', path)
    if m and m.group(1) in prod_by_dir:
        return prod_by_dir[m.group(1)]
    m = re.search(r'notify/triggers/([a-z]+)\.ts', path)
    if m:
        return m.group(1)
    return prefix_prod.get(t.split('_')[0], 'workspace')


def expr_at(seg, start):
    """The JS expression that begins at `start` and ends at the next top-level comma / closing brace."""
    depth = 0
    i = start
    quote = None
    while i < len(seg):
        c = seg[i]
        if quote:
            if c == '\\':
                i += 2
                continue
            if quote == '`' and c == '$' and seg[i + 1:i + 2] == '{':
                # skip the ${ ... } of a template literal
                d = 1
                i += 2
                while i < len(seg) and d:
                    d += (seg[i] == '{') - (seg[i] == '}')
                    i += 1
                continue
            if c == quote:
                quote = None
        elif c in '"\'`':
            quote = c
        elif c in '([{':
            depth += 1
        elif c in ')]}':
            if depth == 0:
                break
            depth -= 1
        elif c == ',' and depth == 0:
            break
        i += 1
    return seg[start:i].strip()


def split_ternary(expr):
    """`cond ? a : b` -> [a, b] (top level only); anything else -> [expr]."""
    depth = 0
    quote = None
    q = None
    i = 0
    while i < len(expr):
        c = expr[i]
        if quote:
            if c == '\\':
                i += 2
                continue
            if quote == '`' and c == '$' and expr[i + 1:i + 2] == '{':
                d = 1
                i += 2
                while i < len(expr) and d:
                    d += (expr[i] == '{') - (expr[i] == '}')
                    i += 1
                continue
            if c == quote:
                quote = None
        elif c in '"\'`':
            quote = c
        elif c in '([{':
            depth += 1
        elif c in ')]}':
            depth -= 1
        elif c == '?' and depth == 0 and expr[i + 1:i + 2] not in '.?' and q is None:
            q = i
        elif c == ':' and depth == 0 and q is not None:
            return [expr[q + 1:i].strip(), expr[i + 1:].strip()]
        i += 1
    return [expr]


def to_template(expr):
    """A string/template literal -> readable text with {name} for each ${...}; anything else -> None."""
    expr = expr.strip()
    if expr in ('null', 'undefined', '""', "''"):
        return None
    m = re.fullmatch(r'"((?:[^"\\]|\\.)*)"', expr) or re.fullmatch(r"'((?:[^'\\]|\\.)*)'", expr)
    if m:
        return m.group(1)
    if expr.startswith('`') and expr.endswith('`'):
        inner = expr[1:-1]

        def name_of(e):
            e = re.sub(r'\s+as\s+[\w.]+', '', e.strip())
            e = re.sub(r'\s*(\?\?|\|\|)\s*("[^"]*"|\'[^\']*\'|\d+)\s*$', '', e)  # `x ?? "fallback"` -> x
            tern = split_ternary(e)
            if len(tern) == 2:
                lits = [to_template(x) for x in tern]
                if all(x is not None and len(x) < 24 for x in lits):
                    return '/'.join(lits)
                return name_of(tern[0])
            call = re.fullmatch(r'([A-Za-z_][\w.]*)\((.*)\)', e, re.S)
            if call:
                func = call.group(1)
                if '.' in func:  # a method call: name the thing it is called on
                    return name_of(func.rsplit('.', 1)[0])
                return name_of(call.group(2).split(',')[0])
            e = re.sub(r'\.(toUpperCase|toLowerCase|toFixed|toLocaleString|toISOString|trim|length|value)\b(\([^()]*\))?', '', e)
            idents = [i for i in re.findall(r'[A-Za-z_][A-Za-z0-9_]*', e) if i not in ('Math', 'IN', 'Number', 'String', 'value')]
            return idents[-1] if idents else 'value'

        out, i = '', 0
        while i < len(inner):
            if inner.startswith('${', i):
                d, j = 1, i + 2
                while j < len(inner) and d:
                    d += (inner[j] == '{') - (inner[j] == '}')
                    j += 1
                piece = inner[i + 2:j - 1]
                tern = split_ternary(piece.strip())
                lits = [to_template(x) for x in tern] if len(tern) == 2 else []
                if lits and set(lits) <= {None, '', 's', 'es', 'y', 'ies', ' is', 'are', ' are'} and ('s' in lits or 'es' in lits or 'ies' in lits):
                    out += '(s)'  # a plural ending (`item${n === 1 ? "" : "s"}`)
                else:
                    out += '{' + name_of(piece) + '}'
                i = j
            else:
                out += inner[i]
                i += 1
        return out
    return None


def object_around(seg, pos):
    """The `{ ... }` object literal that contains position `pos` (properties before and after it), or None."""
    depth = 0
    i = pos - 1
    while i >= 0:
        c = seg[i]
        if c in ')]}':
            depth += 1
        elif c in '([{':
            if depth == 0:
                return (i, c)
            depth -= 1
        i -= 1
    return None


def wording(seg, type_expr, key, type_pos=0):
    """(title, body) templates for `key` from the notification object that holds the `type:` property, picking the branch that matches a conditional type."""
    start = object_around(seg, type_pos)
    if start and start[1] == '{':
        # the object runs to its matching brace
        d, j = 0, start[0]
        quote = None
        while j < len(seg):
            c = seg[j]
            if quote:
                if c == '\\':
                    j += 2
                    continue
                if c == quote:
                    quote = None
            elif c in '"\'`':
                quote = c
            elif c == '{':
                d += 1
            elif c == '}':
                d -= 1
                if d == 0:
                    break
            j += 1
        seg = seg[start[0]:j + 1]
    else:
        return [None, None]
    types = re.findall(r'"([a-z][a-z0-9_]+)"', type_expr)
    idx = types.index(key) if key in types and len(types) > 1 else 0
    out = []
    for prop in ('title', 'body'):
        m = re.search(r'\b' + prop + r':\s*', seg)
        if not m:
            out.append(None)
            continue
        parts = split_ternary(expr_at(seg, m.end()))
        out.append(to_template(parts[min(idx, len(parts) - 1)]))
    return out


found = {}
for dp, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith(('.ts', '.tsx')):
            continue
        p = os.path.join(dp, f)
        s = open(p, errors='ignore').read()
        for m in callre.finditer(s):
            seg = s[m.start():m.start() + 900]
            for tm in re.finditer(r'\btype:\s*', seg):
                type_expr = expr_at(seg, tm.end())
                for t in set(re.findall(r'"([a-z][a-z0-9_]+)"', type_expr)):
                    if t in SKIP or '_' not in t:
                        continue
                    title, body = wording(seg, type_expr, t, tm.start())
                    old = found.get(t)
                    score = lambda x: (x[1] is not None) + (x[2] is not None)
                    if old is None or score((None, title, body)) > score(old):
                        found[t] = (product_of(p, t), title, body)
        for m in re.finditer(r'export type (\w*Notification\w*Type|\w*NotificationType)\s*=([^;]+);', s):
            for t in re.findall(r'"([a-z][a-z0-9_]+)"', m.group(2)):
                if t not in found and t not in SKIP and '_' in t:
                    found[t] = (product_of(p, t), None, None)

rows = sorted((v[0], k, v[1], v[2]) for k, v in found.items())
js = lambda x: 'null' if x is None else '"' + x.replace('\\', '\\\\').replace('"', '\\"') + '"'
lines = ["/* Generated by scripts/gen-notification-catalog.py from the notification call sites: event key, product, and the title/body wording found in the code ({name} = a value filled in when it is sent). Seeds each company's Notification center and shows the original wording in its editor; the list itself lives in the database and grows by itself whenever a new event is raised. */",
         'export const SEED_EVENTS: readonly (readonly [key: string, product: string, title: string | null, body: string | null])[] = [']
lines += [f'  ["{k}", "{pr}", {js(t)}, {js(b)}],' for pr, k, t, b in rows]
lines.append('];')
open('src/lib/notify/center/seed-events.ts', 'w').write('\n'.join(lines) + '\n')
print(len(rows), 'events;', sum(1 for r in rows if r[2]), 'with a title found')
