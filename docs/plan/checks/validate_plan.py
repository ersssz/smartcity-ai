from pathlib import Path
import re
import json
from urllib.parse import unquote

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE if (BASE / 'PRODUCT-SPEC.md').is_file() else BASE / 'outputs' / 'astanaai-plan'
errors = []
files = sorted(ROOT.rglob('*.md'))
texts = {p: p.read_text(encoding='utf-8-sig') for p in files}
spec = texts[ROOT / 'PRODUCT-SPEC.md']
us = re.findall(r'\*\*(US-\d{2})\.\*\*', spec)
ats = re.findall(r'^\| (AT-\d{2}) \|', spec, re.M)
for name, actual, expected in [('US', us, 38), ('AT', ats, 20)]:
    wanted = {f'{name}-{i:02d}' for i in range(1, expected + 1)}
    if set(actual) != wanted or len(actual) != expected:
        errors.append(f'{name}: expected unique consecutive {expected}, got {actual}')

local_links = 0
external_links = set()
for path, text in texts.items():
    for raw in re.findall(r'(?<!!)\[[^\]\n]*\]\(([^)]+)\)', text):
        target = raw.split(' "', 1)[0].strip('<> ')
        if target.startswith(('https://', 'http://')):
            external_links.add(target)
            continue
        if target.startswith(('#', 'mailto:', 'codex:')):
            continue
        target = unquote(target.split('#', 1)[0])
        if not target:
            continue
        resolved = path.parent / target
        local_links += 1
        if not resolved.exists():
            errors.append(f'Missing relative link: {path.relative_to(ROOT)} -> {raw}')

def expand_refs(text, prefix):
    found = set()
    for match in re.finditer(rf'\b{prefix}-(\d{{2}})(?:[–—-](?:{prefix}-)?(\d{{2}}))?', text):
        first, last = int(match[1]), int(match[2] or match[1])
        if last < first:
            errors.append(f'Reversed range: {match[0]}')
        found.update(f'{prefix}-{i:02d}' for i in range(first, last + 1))
    return found

tasks = {}
coverage = {'US': set(), 'AT': set()}
for path in sorted((ROOT / 'tasks').glob('*.md')):
    text = texts[path]
    title = re.search(r'^# (T\d{2}):', text)
    if not title:
        errors.append(f'Missing ticket ID: {path.name}')
        continue
    tid = title[1]
    if tid in tasks:
        errors.append(f'Duplicate ticket ID: {tid}')
    if not path.stem.lower().startswith(tid.lower() + '-'):
        errors.append(f'Title/filename mismatch: {path.name}')
    blockers = re.search(r'^\*\*Blocked by:\*\* (.+)', text, re.M)
    status = re.search(r'^\*\*Статус:\*\* (.+)', text, re.M)
    owner = re.search(r'^\*\*Владелец:\*\* (.+)', text, re.M)
    ac = re.findall(r'^- \[([ xX])\] (.+)', text, re.M)
    if not all([blockers, status, owner, ac]):
        errors.append(f'Incomplete ticket metadata/AC: {tid}')
    deps = set(re.findall(r'T\d{2}', blockers[1] if blockers else ''))
    tasks[tid] = {'file': path.name, 'blocked_by': sorted(deps), 'status': status[1].strip() if status else None, 'owner': owner[1].strip() if owner else None, 'ac_count': len(ac)}
    if any(mark.lower() == 'x' for mark, _ in ac):
        errors.append(f'Plan claims completed implementation AC: {tid}')
    line = re.search(r'^\*\*Спецификация:\*\* (.+)', text, re.M)
    for prefix, valid in [('US', set(us)), ('AT', set(ats))]:
        refs = expand_refs(line[1] if line else '', prefix)
        coverage[prefix].update(refs)
        if not refs:
            errors.append(f'No {prefix} references: {tid}')
        if refs - valid:
            errors.append(f'Unknown {prefix} in {tid}: {sorted(refs-valid)}')

if set(tasks) != {f'T{i:02d}' for i in range(1, 23)}:
    errors.append(f'Expected T01..T22, got {sorted(tasks)}')
for tid, task in tasks.items():
    for dep in task['blocked_by']:
        if dep not in tasks or dep == tid:
            errors.append(f'Invalid blocker {tid} <- {dep}')

visited, visiting, order = set(), set(), []
def visit(tid):
    if tid in visiting:
        errors.append(f'Cycle at {tid}')
        return
    if tid in visited:
        return
    visiting.add(tid)
    for dep in tasks[tid]['blocked_by']:
        if dep in tasks:
            visit(dep)
    visiting.remove(tid)
    visited.add(tid)
    order.append(tid)
for tid in tasks:
    visit(tid)

ready = sorted(tid for tid, task in tasks.items() if not task['blocked_by'])
if ready != ['T01', 'T02']:
    errors.append(f'Unexpected initial frontier: {ready}')
for tid, task in tasks.items():
    expected = 'ready-for-agent' if tid in ready else 'blocked'
    if task['status'] != expected:
        errors.append(f'Status inconsistency {tid}: {task["status"]} != {expected}')

table = texts[ROOT / 'TEAM-WORKFLOW.md']
table_rows = re.findall(r'^\| \[(T\d{2})\]\([^)]+\) \| [^|]+ \| ([^|]+) \| ([^|]+) \| ([^|]+) \|', table, re.M)
if len(table_rows) != len(tasks):
    errors.append(f'Team task table rows {len(table_rows)} != tickets {len(tasks)}')
for tid, owner, deps, status in table_rows:
    task = tasks.get(tid)
    if not task:
        continue
    if sorted(set(re.findall(r'T\d{2}', deps))) != task['blocked_by']:
        errors.append(f'Table blockers differ: {tid}')
    if owner.strip() != task['owner'] or status.strip() != task['status']:
        errors.append(f'Table owner/status differs: {tid}')

for prefix, valid in [('US', set(us)), ('AT', set(ats))]:
    if valid - coverage[prefix]:
        errors.append(f'Uncovered {prefix} in ticket specification refs: {sorted(valid-coverage[prefix])}')

result = {
    'status': 'PASS' if not errors else 'FAIL',
    'markdown_files': len(files), 'local_links_checked': local_links,
    'unique_external_source_links': len(external_links),
    'user_stories': len(us), 'acceptance_scenarios': len(ats),
    'tickets': len(tasks), 'direct_dependency_edges': sum(len(x['blocked_by']) for x in tasks.values()),
    'initial_ready': ready, 'topological_order': order,
    'implementation_ac_all_unchecked': not any('claims completed' in e for e in errors),
    'ticket_ac_total': sum(t['ac_count'] for t in tasks.values()),
    'reference_coverage': {p: len(v) for p, v in coverage.items()},
    'errors': errors,
}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if not errors else 1)
