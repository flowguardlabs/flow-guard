/**
 * OPTN Phase 1 evidence capture harness.
 *
 * Paste this whole file into the browser devtools console on the FlowGuard tab
 * BEFORE connecting OPTN. It wraps `window.fetch` and records every request that
 * carries Phase 1 evidence, so nothing has to be hand-copied out of the Network
 * panel — transcription is where this kind of evidence usually goes wrong.
 *
 * It observes only. It does not modify requests, responses, or app behaviour.
 *
 *   __optn.report()   → PASS/FAIL for every assertion that can be checked in-browser
 *   __optn.save()     → downloads optn-phase1-capture.json
 *   __optn.hex()      → lists captured transaction hexes, ready for the scanner
 *   __optn.reset()    → clears the log (does not un-patch fetch)
 *
 * Feed the hexes to the placeholder scanner:
 *   node scripts/scan-tx-placeholders.mjs <hex>
 *
 * See docs/integrations/optn-phase1-testplan.md and
 *     docs/integrations/optn-phase1-evidence.md
 */

(() => {
  if (window.__optn) {
    console.warn('[optn-capture] already installed — call __optn.reset() to start a fresh run');
    return;
  }

  const WATCHED = [
    { key: 'nonce', match: (u) => u.includes('/api/auth/nonce') },
    { key: 'verify', match: (u) => /\/api\/auth\/verify$/.test(u) },
    { key: 'verifyTx', match: (u) => u.includes('/api/auth/verify-tx') },
    { key: 'broadcast', match: (u) => u.includes('/api/transactions/broadcast') },
    { key: 'fundingInfo', match: (u) => u.includes('/funding-info') },
    { key: 'confirmFunding', match: (u) => u.includes('/confirm-funding') },
    { key: 'cancel', match: (u) => u.includes('/cancel') },
    { key: 'createPayment', match: (u) => /\/api\/payments\/create/.test(u) },
  ];

  const log = [];
  const originalFetch = window.fetch.bind(window);

  function classify(url) {
    return WATCHED.find((w) => w.match(url))?.key ?? null;
  }

  /** Best-effort JSON parse; returns the raw string when it is not JSON. */
  function parseMaybeJson(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text.length > 4000 ? `${text.slice(0, 4000)}…[truncated]` : text;
    }
  }

  window.fetch = async function capturedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input));
    const kind = classify(url);
    if (!kind) return originalFetch(input, init);

    const entry = {
      kind,
      url,
      method: (init?.method ?? (typeof input === 'object' ? input?.method : 'GET') ?? 'GET').toUpperCase(),
      at: new Date().toISOString(),
      request: parseMaybeJson(typeof init?.body === 'string' ? init.body : null),
    };

    let response;
    try {
      response = await originalFetch(input, init);
    } catch (error) {
      entry.networkError = String(error);
      log.push(entry);
      throw error;
    }

    entry.status = response.status;
    try {
      entry.response = parseMaybeJson(await response.clone().text());
    } catch {
      entry.response = '[unreadable body]';
    }
    log.push(entry);
    console.debug(`[optn-capture] ${entry.kind} ${entry.status}`);
    return response;
  };

  const first = (kind) => log.find((e) => e.kind === kind);
  const all = (kind) => log.filter((e) => e.kind === kind);

  function check(name, condition, detail) {
    return { name, state: condition === null ? 'N/A ' : condition ? 'PASS' : 'FAIL', detail };
  }

  function buildReport() {
    const nonce = first('nonce');
    const verifyTx = first('verifyTx');
    const verify = first('verify');

    const rows = [
      check(
        'auth/nonce sent txProof: true',
        nonce ? nonce.request?.txProof === true : null,
        nonce ? `txProof=${JSON.stringify(nonce.request?.txProof)} walletType=${JSON.stringify(nonce.request?.walletType)}` : 'no /auth/nonce seen yet',
      ),
      check(
        'auth/nonce returned authProof',
        nonce ? Boolean(nonce.response?.authProof) : null,
        nonce ? (nonce.response?.authProof ? 'present' : 'ABSENT — backend gate did not fire') : 'no /auth/nonce seen yet',
      ),
      check(
        'auth/verify-tx succeeded',
        verifyTx ? verifyTx.status === 200 : null,
        verifyTx ? `status ${verifyTx.status}` : 'no /auth/verify-tx seen yet',
      ),
      check(
        'auth/verify (message path) NOT used',
        !verify,
        verify ? `UNEXPECTED: /auth/verify called, status ${verify.status}` : 'never called — correct for OPTN',
      ),
      check(
        'broadcast(s) captured',
        all('broadcast').length > 0,
        `${all('broadcast').length} broadcast call(s)`,
      ),
    ];

    return rows;
  }

  function collectHexes() {
    const out = [];
    const seen = new Set();
    for (const entry of log) {
      // `signedTransaction` means different things per endpoint: the proof tx on
      // verify-tx (must NEVER be broadcast) versus a real signed spend elsewhere.
      // Label by endpoint so the two are never confused in the evidence file.
      const label =
        entry.kind === 'verifyTx' ? 'auth proof tx (must not be broadcast)' : 'signed transaction';
      const candidates = [
        ['broadcast txHex', entry.request?.txHex],
        [label, entry.request?.signedTransaction],
      ];
      for (const [candidateLabel, hex] of candidates) {
        if (typeof hex !== 'string' || !/^[0-9a-fA-F]{40,}$/.test(hex)) continue;
        const dedupeKey = `${entry.kind}:${hex}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        out.push({ kind: entry.kind, label: candidateLabel, at: entry.at, bytes: hex.length / 2, hex });
      }
    }
    return out;
  }

  window.__optn = {
    get log() {
      return log;
    },

    report() {
      const rows = buildReport();
      console.log('\n=== OPTN Phase 1 — in-browser assertions ===');
      for (const r of rows) console.log(`[${r.state}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
      console.log(
        '\nNot checkable here (needs chain/wallet): covenant placeholder removal, refund amount,\n' +
          'payment_count increment, proof-tx never broadcast, sign-modal contents.',
      );
      const hexes = collectHexes();
      console.log(`\n${hexes.length} transaction hex(es) captured — run __optn.hex() to list them.`);
      return rows;
    },

    hex() {
      const hexes = collectHexes();
      if (hexes.length === 0) {
        console.log('No transaction hexes captured yet.');
        return [];
      }
      for (const h of hexes) {
        console.log(`\n--- ${h.kind} / ${h.label} — ${h.bytes} bytes @ ${h.at}`);
        console.log(`node scripts/scan-tx-placeholders.mjs ${h.hex}`);
      }
      return hexes;
    },

    save() {
      const payload = {
        capturedAt: new Date().toISOString(),
        origin: window.location.origin,
        userAgent: navigator.userAgent,
        assertions: buildReport(),
        transactionHexes: collectHexes(),
        log,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'optn-phase1-capture.json';
      a.click();
      URL.revokeObjectURL(url);
      console.log('[optn-capture] saved optn-phase1-capture.json');
    },

    reset() {
      log.length = 0;
      console.log('[optn-capture] log cleared');
    },
  };

  console.log(
    '[optn-capture] installed. Connect OPTN, run the test plan, then call:\n' +
      '  __optn.report()   PASS/FAIL summary\n' +
      '  __optn.hex()      transaction hexes + ready-to-paste scanner commands\n' +
      '  __optn.save()     download the full capture',
  );
})();
