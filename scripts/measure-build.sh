#!/usr/bin/env bash
# Builds the app the way Vercel's small build machine would, and measures it.
#
#   scripts/measure-build.sh [--cap MB] [--cpus LIST] [--label NAME] [--keep] [-- <extra next build args>]
#
# The build runs in a throwaway COPY of the project (the real .next is never touched), under a memory ceiling that kills like Vercel (a systemd
# cgroup with no swap; default 7500 MB) and on a CPU subset (default 2 cores: 0-1), with VERCEL=1 so the same config branches apply.
# It prints: whether it was killed (OOM), the time of each phase, the peak anonymous memory (what an OOM kill counts) and the peak including page cache.
# No database is needed (a throwaway URI is passed; `next build` never connects). Never uses real tokens.
set -uo pipefail
CAP=7500; CPUS="0-1"; LABEL="build"; KEEP=0; PREP=""; EXTRA=()
while [ $# -gt 0 ]; do
  case "$1" in
    --cap) CAP="$2"; shift 2;;
    --cpus) CPUS="$2"; shift 2;;
    --label) LABEL="$2"; shift 2;;
    --keep) KEEP=1; shift;;
    --prep) PREP="$2"; shift 2;;   # a shell command run inside the throwaway copy before the build (to measure what a file costs)
    --) shift; EXTRA=("$@"); break;;
    *) echo "unknown option $1" >&2; exit 2;;
  esac
done
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(dirname "$ROOT")/.buildmem-$LABEL"
OUT="${BUILD_MEMORY_OUT:-/tmp/buildmem-$LABEL}"
mkdir -p "$OUT"
rm -rf "$TMP"; mkdir -p "$TMP"
for f in $(ls -A "$ROOT" | grep -vE '^(node_modules|\.git|\.next|\.vercel|desktop|mobile|local|docs|\.env.*|.*\.tsbuildinfo)$'); do cp -a "$ROOT/$f" "$TMP/"; done
cp -al "$ROOT/node_modules" "$TMP/node_modules"
cd "$TMP" || exit 2
[ -z "$PREP" ] || bash -c "$PREP"
EXTRA_Q=""; [ ${#EXTRA[@]} -gt 0 ] && EXTRA_Q="$(printf '%q ' "${EXTRA[@]}")"
START=$(date +%s)
LOG="$OUT/build.log"
cat > "$OUT/inner.sh" <<INNER
#!/usr/bin/env bash
cg=/sys/fs/cgroup\$(cut -d: -f3 /proc/self/cgroup)
( peak=0; while true; do a=\$(awk '/^anon /{print \$2}' "\$cg/memory.stat" 2>/dev/null); [ -n "\$a" ] && [ "\$a" -gt "\$peak" ] && { peak=\$a; echo \$peak > "$OUT/peak-anon"; }; sleep 2; done ) &
SAMPLER=\$!
env \${BUILD_EXPERIMENTS:+BUILD_EXPERIMENTS=\$BUILD_EXPERIMENTS} \${MEASURE_NODE_OPTIONS:+NODE_OPTIONS="\$MEASURE_NODE_OPTIONS"} VERCEL=1 NODE_ENV=production MONGODB_URI=mongodb://127.0.0.1:27017/zz_throwaway_build SAAS_HOSTS=build.test NEXT_TELEMETRY_DISABLED=1 taskset -c $CPUS npx next build ${EXTRA_Q} 2>&1 | while IFS= read -r line; do printf '%s %s\n' "\$(date +%s)" "\$line"; done > "$LOG"
ec=\${PIPESTATUS[0]}
kill \$SAMPLER 2>/dev/null
cat "\$cg/memory.peak" > "$OUT/peak-current" 2>/dev/null
echo \$ec > "$OUT/exit-code"
INNER
chmod +x "$OUT/inner.sh"; rm -f "$OUT/peak-anon" "$OUT/peak-current" "$OUT/exit-code"
systemd-run --user --scope --quiet -p MemoryMax="${CAP}M" -p MemorySwapMax=0 --expand-environment=no bash "$OUT/inner.sh"
END=$(date +%s)
EC=$(cat "$OUT/exit-code" 2>/dev/null || echo "killed")
phase() { grep -m1 "$1" "$LOG" 2>/dev/null | awk '{print $1}'; }
t0=$START; tc=$(phase "Creating an optimized production build"); tdone=$(grep -m1 "Compiled successfully" "$LOG" | awk '{print $1}'); tts=$(phase "Running TypeScript"); tcol=$(phase "Collecting page data"); tgen=$(phase "Generating static pages"); tfin=$(phase "Finalizing page optimization")
rel() { [ -n "$1" ] && echo "$(( $1 - t0 ))s" || echo "-"; }
{
  echo "label: $LABEL  cap: ${CAP} MB  cpus: $CPUS  extra: ${EXTRA[*]:-none}"
  echo "exit code: $EC  (137 or 'killed' = out of memory)"
  echo "total: $(( END - START ))s"
  echo "compile starts at $(rel "$tc"), compiled at $(rel "$tdone"), typescript at $(rel "$tts"), page data at $(rel "$tcol"), static pages at $(rel "$tgen"), finalizing at $(rel "$tfin")"
  echo "peak anonymous memory: $(( $(cat "$OUT/peak-anon" 2>/dev/null || echo 0) / 1048576 )) MB   peak incl. page cache: $(( $(cat "$OUT/peak-current" 2>/dev/null || echo 0) / 1048576 )) MB"
  echo "route entries: $(grep -cE '^[0-9]+ [├└┌] ' "$LOG") listed; functions (if built): $(find .next/server -name '*.nft.json' 2>/dev/null | wc -l) traces"
} | tee "$OUT/summary.txt"
[ "$KEEP" = 1 ] || rm -rf "$TMP"
case "$EC" in 0) exit 0;; *) exit 1;; esac
