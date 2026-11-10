'use strict';

function nextDocFileName(kind, existingNames) {
  var base = String(kind || 'doc').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'doc';
  var max = 0;
  (existingNames || []).forEach(function(raw) {
    var s = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
    var m = s.match(new RegExp('(?:^|_|\\/)' + base + '(\\d+)?\\.pdf$'));
    if (!m) return;
    var num = m[1] ? parseInt(m[1], 10) : 1;
    if (num > 99) return;
    if (num > max) max = num;
  });
  var next = max + 1;
  return next <= 1 ? base + '.pdf' : base + next + '.pdf';
}

module.exports = { nextDocFileName };
