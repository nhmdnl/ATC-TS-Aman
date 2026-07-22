#!/usr/bin/env node
// Run after recording: node scripts/generate-manifest.js
// Scans public/assets/voice/atc/ and public/assets/voice/pilot/ for .wav files
// and writes public/assets/voice/manifest.json

const fs = require('fs')
const path = require('path')

const voiceDir = path.join(__dirname, '..', 'public', 'assets', 'voice')
const atcDir   = path.join(voiceDir, 'atc')
const pilDir   = path.join(voiceDir, 'pilot')
const out      = path.join(voiceDir, 'manifest.json')

function wavTokens(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.wav'))
    .map(f => path.basename(f, '.wav'))
    .sort()
}

const tokens = [...wavTokens(atcDir), ...wavTokens(pilDir)]
fs.writeFileSync(out, JSON.stringify({ version: 1, tokens }, null, 2))
console.log(`manifest.json written — ${tokens.length} tokens (${wavTokens(atcDir).length} atc, ${wavTokens(pilDir).length} pilot)`)
