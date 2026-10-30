import { audit } from './engine.mjs';
import { TEMPLATE } from './template.mjs';
import { canonicalFormula as canonical } from './formula.mjs';
import {
  SECTIONS, DERIVED_FORMULAS, cellKey, value, number, originalCell,
  effectiveFormula, formulaValue, amend,
} from './model.mjs';

const bi = (ar, en) => ({ ar, en });
const validNumber = (n, fraction = false) =>
  n !== null && n >= 0 && n <= 1000000 && (fraction || Number.isInteger(n));

export function possibleCorrections(doc, result = audit(doc)) {
  if (!result.schemaValid) return [];
  const items = [];
  for (const sec of SECTIONS) {
    for (const row of sec.rows) {
      for (const col of sec.cols) {
        const cell = `${col}${row}`, raw = value(doc, sec.sheet, cell);
        const n = number(raw);
        const sourceFormula = originalCell(doc, sec.sheet, cell)?.f;
        if (typeof raw !== 'string' || !validNumber(n, sec.sheet === 'DtoPK' && col === 'G') ||
            (sourceFormula && !Object.hasOwn(doc.edits || {}, cellKey(sec.sheet, cell)))) continue;
        items.push({
          id: `number:${cellKey(sec.sheet, cell)}`, kind: 'number',
          sheet: sec.sheet, cell, before: raw, after: n,
          title: bi('تحويل الرقم النصي إلى عدد', 'Convert numeric text to a number'),
          reason: bi(
            `القيمة «${raw}» تمثل العدد ${n}. يُصحح نوع التخزين فقط وتبقى الكمية نفسها.`,
            `The text '${raw}' represents ${n}. Only its storage type changes; the amount stays the same.`
          ),
          source: 'Input numeric validation / ED V4.25',
        });
      }
    }
  }
  for (const sec of SECTIONS.slice(0, 2)) {
    for (const col of sec.cols) {
      const cell = `${col}7`, key = cellKey(sec.sheet, cell);
      if (!originalCell(doc, sec.sheet, cell)) continue;
      const formula = DERIVED_FORMULAS[key], computed = formulaValue(doc, sec.sheet, cell);
      // Recompute a known formula only. An unknown or replaced formula requires review.
      const knownTotal = [formula, TEMPLATE.formulas[sec.sheet]?.[cell]].some(f =>
        canonical(effectiveFormula(doc, sec.sheet, cell)) === canonical(f));
      if (Object.hasOwn(doc.formulaEdits || {}, key) || computed === null || !knownTotal) continue;
      const cached = number(value(doc, sec.sheet, cell));
      if (cached === null && computed === 0) continue;
      if (cached !== null && Math.abs(cached - computed) <= 1e-8) continue;
      items.push({
        id: `total:${key}`, kind: 'formula', sheet: sec.sheet, cell,
        before: effectiveFormula(doc, sec.sheet, cell), after: formula,
        beforeValue: cached, afterValue: computed,
        title: bi('تحديث الإجمالي المحسوب', 'Refresh a calculated total'),
        reason: bi(
          `نجمع ${col}2 إلى ${col}6؛ الناتج ${computed}. هذا يصحح الإجمالي المحسوب ولا يثبت صحة الأعداد المدخلة.`,
          `Sum ${col}2 through ${col}6 to get ${computed}. This corrects the calculated total; it does not validate the entered counts.`
        ),
        source: `${sec.sheet}!${col}2:${col}6`,
      });
    }
  }
  const ss = 'Summary Sheet', cell = 'H19', key = cellKey(ss, cell);
  const outcomeChecks = result.checks.filter(c => c.rule === 'outcomes');
  const sourceCell = originalCell(doc, ss, cell);
  const knownFormula = sourceCell
    ? canonical(sourceCell.f) === canonical(TEMPLATE.formulas[ss][cell])
    : doc.mode !== 'import';
  if (!result.definitionChanged && knownFormula &&
      outcomeChecks.length === 5 && outcomeChecks.every(c => c.pass) &&
      result.kpis[3].value !== null && formulaValue(doc, ss, cell) !== null &&
      !Object.hasOwn(doc.formulaEdits || {}, key)) {
    items.push({
      id: 'nonurgent:H19', kind: 'formula', sheet: ss, cell,
      before: effectiveFormula(doc, ss, cell), after: DERIVED_FORMULAS[key],
      beforeValue: result.kpis[3].workbook, afterValue: result.kpis[3].value, unit: '%',
      title: bi('تصحيح صيغة المرضى غير العاجلين', 'Correct the non-urgent formula'),
      reason: bi(
        `التعريف B7: مرضى CTAS 4 و5 ÷ إجمالي المرضى × 100. لا يذكر خصم التنويم أو الإحالة. الناتج ${result.kpis[3].value.toFixed(2)}%.` +
          (Math.abs(result.kpis[3].value - result.kpis[3].workbook) < 1e-8
            ? ' النسبة لا تتغير في هذا الملف لأن الخصم الحالي صفر؛ التصحيح يضبط صيغة الحساب.' : ''),
        `B7: CTAS 4 and 5 patients ÷ all patients × 100. It does not subtract admissions or referrals. Result: ${result.kpis[3].value.toFixed(2)}%.` +
          (Math.abs(result.kpis[3].value - result.kpis[3].workbook) < 1e-8
            ? ' The rate stays the same in this file because the current subtraction is zero; this corrects the calculation formula.' : '')
      ),
      source: 'ED KPIs Definitions!B7 / Summary Sheet!H19',
    });
  }
  return items;
}

export function activeCorrections(doc) {
  const latest = new Map();
  for (const entry of doc.log || [])
    if (entry.correctionId) latest.set(entry.correctionId, entry);
  return [...latest.values()].filter(entry =>
    entry.operation === 'apply' && (entry.kind === 'formula'
      ? doc.formulaEdits?.[cellKey(entry.sheet, entry.cell)] === entry.after
      : value(doc, entry.sheet, entry.cell) === entry.after)
  );
}

export function applyCorrection(doc, id) {
  // Always regenerate against the latest state, never trust a stale preview.
  const item = possibleCorrections(doc).find(c => c.id === id);
  if (!item) return doc;
  const context = {
    correctionId: item.id, kind: item.kind, operation: 'apply',
    reason: item.reason, source: item.source,
  };
  if (item.kind === 'number')
    return amend(doc, item.sheet, item.cell, item.after, context);
  return {
    ...doc,
    formulaEdits: { ...doc.formulaEdits, [cellKey(item.sheet, item.cell)]: item.after },
    log: [...doc.log, {
      sheet: item.sheet, cell: item.cell, before: item.before ?? null, after: item.after,
      beforeValue: item.beforeValue, afterValue: item.afterValue,
      at: new Date().toISOString(), ...context,
    }],
  };
}

export function undoCorrection(doc, id) {
  const entry = activeCorrections(doc).find(c => c.correctionId === id);
  if (!entry) return doc;
  const context = {
    correctionId: id, kind: entry.kind, operation: 'undo',
    reason: entry.reason, source: entry.source,
  };
  if (entry.kind === 'number')
    return amend(doc, entry.sheet, entry.cell, entry.before, context);
  const formulaEdits = { ...doc.formulaEdits };
  delete formulaEdits[cellKey(entry.sheet, entry.cell)];
  return {
    ...doc, formulaEdits,
    log: [...doc.log, {
      sheet: entry.sheet, cell: entry.cell, before: entry.after, after: entry.before,
      at: new Date().toISOString(), ...context,
    }],
  };
}

