export async function measureIconAlignment(page, state) {
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate((state) => {
    const iconSelector = 'svg, img[src*="_tropy"], img[src*="tier"], img[src*="crown"], [data-icon], span[aria-hidden="true"].rounded-full';
    const marker = /^[↗→←‹›△▲▽▼●🏆💫🥇🥈🥉]$/u;
    const icons = [...document.querySelectorAll(iconSelector)];

    for (const element of document.querySelectorAll('span, h1, h2, h3, a, button')) {
      if (element.childElementCount === 0 && marker.test(element.textContent.trim()) && !icons.includes(element)) {
        icons.push(element);
      }
    }

    function isVisible(element) {
      if (!element || !element.getClientRects().length || element.closest('[hidden], [inert]')) return false;
      const style = getComputedStyle(element);
      return style.visibility === 'visible';
    }

    const textOffsets = new Map();

    function textBaselineOffset(element, text) {
      const { font, letterSpacing, textTransform } = getComputedStyle(element);
      const key = JSON.stringify([font, letterSpacing, textTransform, text]);
      if (textOffsets.has(key)) return textOffsets.get(key);
      const probe = document.createElement('span');
      Object.assign(probe.style, {
        position: 'fixed', inset: '0 auto auto 0', visibility: 'hidden',
        display: 'block', whiteSpace: 'nowrap', font, letterSpacing, textTransform,
      });
      probe.textContent = text;
      document.body.append(probe);
      const lineBox = probe.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(probe);
      const letters = range.getBoundingClientRect();
      const offset = (letters.top + letters.bottom - lineBox.top - lineBox.bottom) / 2;
      probe.remove();
      textOffsets.set(key, offset);
      return offset;
    }

    function siblingLabel(node) {
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (!isVisible(element) || (node === element && element.matches(iconSelector))) return null;
      const texts = [];
      if (node.nodeType === Node.TEXT_NODE) {
        texts.push(node);
      } else if (node === element && !element.matches('button, input, svg')) {
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) texts.push(walker.currentNode);
      }
      const rects = [];
      const text = [];
      for (const leaf of texts) {
        const value = leaf.textContent.trim();
        if (!value || marker.test(value) || !isVisible(leaf.parentElement)) continue;
        if (leaf.parentElement.closest('svg, [aria-hidden="true"]')) continue;
        const range = document.createRange();
        range.setStart(leaf, leaf.textContent.indexOf(value));
        range.setEnd(leaf, leaf.textContent.indexOf(value) + value.length);
        const visible = [...range.getClientRects()].filter(({ width, height }) => width > 0 && height > 0);
        if (visible.length === 0) continue;
        rects.push(...visible);
        text.push(value);
      }
      if (rects.length === 0) return null;
      const label = text.join(' ');
      const top = Math.min(...rects.map((rect) => rect.top));
      const bottom = Math.max(...rects.map((rect) => rect.bottom));
      const rect = element.getBoundingClientRect();
      // A sibling with its own box can contain a whole two-line label group.
      // Anonymous flex text items expose font bounds through Range, so subtract the font's baseline offset.
      const center = node === element && rect.height > 0 && getComputedStyle(element).display !== 'inline'
        ? rect.top + rect.height / 2
        : (top + bottom) / 2 - textBaselineOffset(element, label);
      return {
        text: label.slice(0, 100), center, height: bottom - top,
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
      };
    }

    const pairs = [];
    for (const icon of icons) {
      if (!isVisible(icon) || icon.parentElement?.closest('svg')) continue;
      const rect = icon.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.width > 64 || rect.height > 64) continue;
      const midpoint = rect.top + rect.height / 2;
      let branch = icon;
      for (let depth = 0; depth < 2 && branch.parentElement; depth += 1) {
        if (getComputedStyle(branch).position === 'absolute') break;
        const row = branch.parentElement;
        if (branch.matches('a, button') && depth > 0) break;
        const display = getComputedStyle(row);
        if (display.flexDirection === 'column' && display.display.includes('flex')) break;
        const candidates = [];
        for (const sibling of row.childNodes) {
          if (sibling === branch) continue;
          const label = siblingLabel(sibling);
          if (!label) continue;
          const gap = Math.max(rect.left - label.right, label.left - rect.right);
          const offset = midpoint - label.center;
          if (gap < -2 || (gap > 72 && display.justifyContent !== 'space-between')) continue;
          if (Math.abs(offset) > Math.max(18, label.height / 2 + 4)) continue;
          candidates.push({ gap, offset, label: label.text });
        }
        candidates.sort((a, b) => a.gap - b.gap || Math.abs(a.offset) - Math.abs(b.offset));
        const pair = candidates[0];
        if (!pair) continue;
        pairs.push({
          state,
          route: location.pathname,
          icon: [...icon.classList].find((name) => name.startsWith('lucide-')) ?? icon.getAttribute('src') ?? (icon.textContent.trim() || icon.localName),
          label: pair.label,
          offset: Math.round(pair.offset * 100) / 100,
          element: row.localName,
          layout: display.display + ' / ' + display.alignItems,
        });
        break;
      }
    }
    return pairs;
  }, state);
}

export async function measureIconPair(row, { state, icon, label }) {
  return row.evaluate((element, { state, icon, label }) => {
    const iconBox = element.querySelector(icon).getBoundingClientRect();
    const labelElement = element.querySelector(label);
    const labelBox = labelElement.getBoundingClientRect();
    const offset = (iconBox.top + iconBox.bottom - labelBox.top - labelBox.bottom) / 2;
    const layout = getComputedStyle(element);
    return {
      state, route: location.pathname, icon,
      label: labelElement.textContent.trim(),
      offset: Math.round(offset * 100) / 100,
      element: element.localName, layout: layout.display + ' / ' + layout.alignItems,
    };
  }, { state, icon, label });
}
