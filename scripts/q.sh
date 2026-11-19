#!/usr/bin/env bash
# Dev helper: run a SQL query against the linked InsForge project, print compact rows.
cd "$(dirname "$0")/.." && npx insforge db query "$1" --json 2>&1 | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const rows=j.rows||j.data||j;(Array.isArray(rows)?rows:[rows]).forEach(r=>console.log(JSON.stringify(r)))}catch(e){console.log(s.trim().split("\n").slice(0,4).join("\n"))}})'
