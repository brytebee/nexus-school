// Fee Calculator logic - extracted from main.js and fees-ui.js

function computeFeeStatus(billed, paid) {
  const b = Number(billed) || 0;
  const p = Number(paid) || 0;
  if (p >= b && b > 0) return "cleared";
  if (p > 0) return "partial";
  return "unpaid";
}

function computeBalance(billed, paid) {
  return (Number(billed) || 0) - (Number(paid) || 0);
}

function evaluateFeeGate({ enabled, mode, threshold, balance, totalBilled }) {
  if (!enabled) return { gated: false, balance };
  if (balance <= 0) return { gated: false, balance: 0 };

  if (mode === 'percent') {
    if (totalBilled <= 0) return { gated: false, balance };
    return { gated: (balance / totalBilled * 100) >= threshold, balance };
  }
  return { gated: threshold === 0 ? balance > 0 : balance >= threshold, balance };
}

module.exports = { computeFeeStatus, computeBalance, evaluateFeeGate };
