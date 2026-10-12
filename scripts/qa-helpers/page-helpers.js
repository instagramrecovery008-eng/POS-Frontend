/**
 * Page-side QA helpers for scripts/qa-subcategory-floor.mjs.
 *
 * These run INSIDE the browser (injected as a plain source string), so they must
 * stay dependency-free and free of build-time tooling. Keeping them in their own
 * file avoids the template-literal escaping traps that silently corrupt regex
 * literals (e.g. `\/` collapsing to `/`).
 *
 * Everything hangs off `window.__qa` and expresses the app in user terms:
 * buttons by visible text, the modal by its heading, rows by their accessible
 * labels.
 */
(() => {
  const norm = (s) => {
    let t = String(s === undefined || s === null ? '' : s);
    t = t.split(String.fromCharCode(10)).join(' ');
    t = t.split(String.fromCharCode(9)).join(' ');
    t = t.split(String.fromCharCode(13)).join(' ');
    // Non-breaking space (U+00A0) is common in JSX whitespace.
    t = t.split(String.fromCharCode(160)).join(' ');
    while (t.indexOf('  ') !== -1) t = t.split('  ').join(' ');
    return t.trim();
  };
  const setVal = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const setSelect = (el, v) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, v);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const panel = () => {
    const h = [].slice.call(document.querySelectorAll('h4')).find((e) => norm(e.textContent) === 'Manage Subcategories');
    return h ? h.closest('div[class*="max-w-md"]') : null;
  };
  const deletePanel = () => {
    const h = [].slice.call(document.querySelectorAll('h4')).find((e) => norm(e.textContent) === 'Delete Subcategory');
    return h ? h.closest('div[class*="max-w-"]') : null;
  };

  window.__qa = {
    login(email, password) {
      const e = document.querySelector('input[placeholder="Enter email or user ID"]');
      const p = document.querySelector('input[placeholder="Enter password"]');
      if (!e || !p) return 'no-form';
      setVal(e, email);
      setVal(p, password);
      const btn = [].slice.call(document.querySelectorAll('button')).find((b) => b.type === 'submit');
      if (!btn) return 'no-submit';
      btn.click();
      return 'submitted';
    },
    loginVisible() { return !!document.querySelector('input[placeholder="Enter password"]'); },
    sidebarText() { const a = document.querySelector('aside'); return a ? norm(a.innerText) : ''; },
    bodyText() { return norm(document.body.innerText); },
    clickText(text, exact) {
      const els = [].slice.call(document.querySelectorAll('button, a, [role="menuitem"]'));
      const el = els.find((b) => (exact ? norm(b.textContent) === text : norm(b.textContent).indexOf(text) !== -1));
      if (!el) return 'not-found:' + text;
      el.click();
      return 'clicked';
    },
    openSubcatModal() {
      const b = [].slice.call(document.querySelectorAll('button')).find((x) => norm(x.textContent).indexOf('Manage Subcategories') !== -1);
      if (!b) return 'not-found';
      b.click();
      return 'clicked';
    },
    closeModal() {
      const p = panel();
      if (!p) return 'no-modal';
      const h = p.querySelector('h4');
      const btn = h.parentElement.querySelector('button');
      if (btn) { btn.click(); return 'clicked'; }
      return 'no-close-button';
    },
    subcatModal() {
      const p = panel();
      if (!p) return { present: false };
      const sel = p.querySelector('select');
      const rows = [].slice.call(p.querySelectorAll('button[aria-label^="Edit subcategory"]')).map((b) => {
        const row = b.parentElement;
        const del = row.querySelector('button[aria-label^="Delete subcategory"]');
        return {
          name: b.getAttribute('aria-label').replace('Edit subcategory ', ''),
          hasEdit: true,
          hasDelete: !!del,
          deleteLabel: del ? del.getAttribute('aria-label') : null,
          rowText: norm(row.innerText),
        };
      });
      const input = p.querySelector('input[aria-label="Subcategory name"]');
      const formLabel = (function () {
        const l = [].slice.call(p.querySelectorAll('label')).find((x) => norm(x.textContent).indexOf('Subcategory') !== -1);
        return l ? norm(l.textContent) : null;
      })();
      const saveBtn = [].slice.call(p.querySelectorAll('button')).find((x) => ['Save', 'Add'].indexOf(norm(x.textContent)) !== -1);
      return {
        present: true,
        rows: rows,
        emptyMessage: /No subcategories yet for this category/.test(norm(p.innerText)),
        options: sel ? [].slice.call(sel.options).map((o) => ({ value: o.value, text: norm(o.textContent) })) : [],
        formLabel: formLabel,
        inputValue: input ? input.value : null,
        buttons: [].slice.call(p.querySelectorAll('button')).map((b) => norm(b.textContent)).filter(Boolean),
        saveDisabled: saveBtn ? saveBtn.disabled : null,
      };
    },
    selectCategory(name) {
      const p = panel();
      if (!p) return 'no-modal';
      const sel = p.querySelector('select');
      if (!sel) return 'no-select';
      const opt = [].slice.call(sel.options).find((o) => norm(o.textContent) === name);
      if (!opt) return 'no-option:' + name;
      setSelect(sel, opt.value);
      return 'selected:' + opt.value;
    },
    rowAction(name, which) {
      const p = panel();
      if (!p) return 'no-modal';
      const label = (which === 'edit' ? 'Edit subcategory ' : 'Delete subcategory ') + name;
      const b = p.querySelector('button[aria-label="' + label + '"]');
      if (!b) return 'not-found:' + label;
      b.click();
      return 'clicked';
    },
    setSubcatName(v) {
      const p = panel();
      if (!p) return 'no-modal';
      const input = p.querySelector('input[aria-label="Subcategory name"]');
      if (!input) return 'no-input';
      setVal(input, v);
      return 'set';
    },
    clickModalButton(text) {
      const p = panel();
      if (!p) return 'no-modal';
      const b = [].slice.call(p.querySelectorAll('button')).find((x) => norm(x.textContent) === text);
      if (!b) return 'not-found:' + text;
      if (b.disabled) return 'disabled';
      b.click();
      return 'clicked';
    },
    deleteDialog() {
      const p = deletePanel();
      if (!p) return { present: false };
      const sel = p.querySelector('select');
      return {
        present: true,
        text: norm(p.innerText),
        options: sel ? [].slice.call(sel.options).map((o) => norm(o.textContent)) : [],
        buttons: [].slice.call(p.querySelectorAll('button')).map((b) => norm(b.textContent)).filter(Boolean),
      };
    },
    closeDeleteDialog() {
      const p = deletePanel();
      if (!p) return 'no-dialog';
      const b = [].slice.call(p.querySelectorAll('button')).find((x) => norm(x.textContent) === 'Cancel');
      if (!b) return 'no-cancel';
      b.click();
      return 'clicked';
    },
    /** The POS wizard's floor step (or the table step when it auto-advanced). */
    floorStep() {
      const heads = [].slice.call(document.querySelectorAll('h3'));
      const h = heads.find((e) => norm(e.textContent).indexOf('Select Floor') !== -1);
      if (!h) {
        const t = heads.find((e) => norm(e.textContent).indexOf('Select Table') !== -1);
        if (t) return { present: true, step: 'table', floors: [], text: norm(t.parentElement.innerText).slice(0, 200) };
        return { present: false };
      }
      const wrap = h.parentElement;
      const names = [].slice.call(wrap.querySelectorAll('button p.font-extrabold')).map((p) => norm(p.textContent));
      return { present: true, step: 'floor', floors: names, text: norm(wrap.innerText).slice(0, 220) };
    },
  };
  return 'ok';
})();
