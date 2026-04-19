/**
 * In-page script for selector capture (STORY-012a).
 *
 * Selector heuristic order in buildSelector():
 *   1. Stable id (#id with CSS.escape)
 *   2. First matching data-* attribute
 *   3. aria-label
 *   4. role, with aria-label pair when both exist, else role alone
 *   5. DOM path from element up to body using tag + nth-of-type disambiguation
 *
 * Hover: blue outline on the element under the pointer.
 * Click: preventDefault / stop propagation, then call Playwright's exposed
 * window.__chSelectorCapturePush({ selector, visibleText, tagName }) when defined.
 */
(function () {
  if (window.__chSelectorCaptureInstalled) return;
  window.__chSelectorCaptureInstalled = true;

  var HIGHLIGHT = '2px solid #0066ff';

  function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, function (c) {
      return '\\' + c;
    });
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return '';
    var tag = el.tagName.toLowerCase();
    if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
      return '#' + cssEscape(el.id);
    }
    var attrs = el.attributes;
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (a.name.indexOf('data-') === 0 && a.value) {
        return (
          tag +
          '[' +
          a.name +
          '="' +
          a.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') +
          '"]'
        );
      }
    }
    var al = el.getAttribute('aria-label');
    if (al) {
      return tag + '[aria-label="' + al.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    }
    var role = el.getAttribute('role');
    if (role) {
      var al2 = el.getAttribute('aria-label');
      if (al2) {
        return (
          tag +
          '[role="' +
          role.replace(/"/g, '\\"') +
          '"][aria-label="' +
          al2.replace(/\\/g, '\\\\').replace(/"/g, '\\"') +
          '"]'
        );
      }
      return tag + '[role="' + role.replace(/"/g, '\\"') + '"]';
    }
    var pathParts = [];
    var cur = el;
    var depth = 0;
    while (cur && cur.nodeType === 1 && depth < 12) {
      var t = cur.tagName.toLowerCase();
      if (cur.id) {
        pathParts.unshift('#' + cssEscape(cur.id));
        break;
      }
      var par = cur.parentElement;
      if (!par) {
        pathParts.unshift(t);
        break;
      }
      var sameTag = [].slice.call(par.children).filter(function (n) {
        return n.tagName === cur.tagName;
      });
      if (sameTag.length > 1) {
        var idx = sameTag.indexOf(cur) + 1;
        t += ':nth-of-type(' + idx + ')';
      }
      pathParts.unshift(t);
      cur = par;
      depth++;
    }
    return pathParts.join(' > ');
  }

  var hoverEl = null;
  function outline(el) {
    if (hoverEl) hoverEl.style.outline = '';
    hoverEl = el;
    if (el) el.style.outline = HIGHLIGHT;
  }

  document.addEventListener(
    'mousemove',
    function (e) {
      outline(e.target);
    },
    true,
  );

  document.addEventListener(
    'click',
    function (e) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      var el = e.target;
      if (!el || el.nodeType !== 1) return;
      var sel = buildSelector(el);
      var txt = (el.innerText || el.textContent || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 50);
      var tag = el.tagName.toLowerCase();
      if (typeof window.__chSelectorCapturePush === 'function') {
        window.__chSelectorCapturePush({ selector: sel, visibleText: txt, tagName: tag });
      }
      return false;
    },
    true,
  );
})();
