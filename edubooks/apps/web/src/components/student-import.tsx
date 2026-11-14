'use client';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAction } from '@/lib/hooks';
import { Button, Dialog, ErrorBox, Field, Input } from '@/components/ui';
import { Credential } from '@/components/common';

type Row = { name: string; email?: string; username?: string; password?: string; className?: string; section?: string; parentName?: string; parentPhone?: string; relation?: string };
const HEADINGS: Record<keyof Row, RegExp> = {
  name: /^(student'?s?\s*)?(full\s*)?name$|^student$|^child$/i,
  username: /^user\s*name$|^login(\s*id)?$|^user\s*id$/i,
  email: /^e-?mail(\s*address)?$/i,
  password: /^password$/i,
  className: /^class(\s*name)?$|^grade$/i,
  section: /^section$/i,
  parentName: /^(parent|father|mother|guardian)('?s)?\s*name$|^parent$/i,
  parentPhone: /^(parent|father|mother|guardian)?('?s)?\s*(mobile|phone|whatsapp|cell)(\s*(no\.?|number))?$/i,
  relation: /^relation(ship)?$/i,
};
const TEMPLATE = 'Name,Class,Section,Parent name,Parent mobile,Relation,Email,Login ID,Password\nAli Raza,KG,Rose,Imran Raza,050 555 0001,Father,,,\nZara Raza,KG,Rose,Imran Raza,050 555 0001,Father,,,\n';

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === ',' || ch === ';' || ch === '\t') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); out.push(row); row = []; cur = ''; } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out.filter((r) => r.some((c) => String(c).trim()));
}

export async function readFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = (await readSheet(file)) as unknown as unknown[][]; // first sheet
    return data.map((r) => r.map((c) => (c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c))));
  }
  if (/\.xls$/i.test(file.name)) throw new Error('Old .xls files are not supported. In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV.');
  return parseCsv(await file.text());
}

export function StudentImport({ onClose, onCreated }: { onClose: () => void; onCreated: (c: Credential[]) => void }) {
  const [rows, setRows] = useState<Row[]>([]); const [unknown, setUnknown] = useState<string[]>([]); const [fileErr, setFileErr] = useState<string | null>(null);
  const [check, setCheck] = useState<any>(null);
  const dry = useAction((r: Row[]) => api.post<any>('/school/import/students?dryRun=1', { rows: r }), { after: setCheck });
  const run = useAction(() => api.post<any>('/school/import/students', { rows }), {
    ok: (r: any) => `${r.students.length} student(s) and ${r.parents.length} parent account(s) created`, keys: ['people', 'schoolOverview', 'schoolParents', 'classes'],
    after: (r: any) => { onClose(); onCreated([...r.students.map((s: any) => ({ ...s, role: 'Student' })), ...r.parents.map((p: any) => ({ ...p, role: `Parent of ${p.children.join(', ')}` }))]); },
  });
  const load = async (file?: File) => {
    if (!file) return; setFileErr(null); setCheck(null);
    try {
      const table = await readFile(file);
      if (table.length < 2) throw new Error('The file needs a heading row and at least one student.');
      const heads = table[0].map((h) => String(h).trim());
      const map = heads.map((h) => (Object.keys(HEADINGS) as (keyof Row)[]).find((k) => HEADINGS[k].test(h)) ?? null);
      if (!map.includes('name')) throw new Error('No “Name” column found. Use the template headings.');
      setUnknown(heads.filter((h, i) => h && !map[i]));
      const data = table.slice(1).map((r) => { const o: any = {}; map.forEach((k, i) => { if (k && String(r[i] ?? '').trim()) o[k] = String(r[i]).trim(); }); return o as Row; }).filter((r) => Object.keys(r).length);
      if (data.length > 1000) throw new Error('At most 1000 students per file. Split the file.');
      setRows(data); dry.mutate(data);
    } catch (e: any) { setFileErr(e.message); setRows([]); }
  };
  const errors = (check?.issues ?? []).filter((i: any) => i.level === 'error'); const warnings = (check?.issues ?? []).filter((i: any) => i.level === 'warning');
  return (
    <Dialog open onOpenChange={onClose} wide title="Import students from Excel" description="One student per row. Only the name is required: a login ID and password are made for each child. Optional: email (they can then sign in with it), class and section (the class must exist), parent name and mobile (one parent account per mobile number, shared by brothers and sisters).">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Excel (.xlsx) or CSV file" className="min-w-64 flex-1"><Input type="file" accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => load(e.target.files?.[0])} /></Field>
          <Button type="button" variant="ghost" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + TEMPLATE], { type: 'text/csv' })); a.download = 'students-template.csv'; a.click(); }}><Download className="size-4" />Template</Button>
        </div>
        {fileErr && <ErrorBox error={new Error(fileErr)} />}
        {unknown.length > 0 && <p className="text-xs text-amber-800">Ignored columns: {unknown.join(', ')}</p>}
        {rows.length > 0 && (
          <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 text-xs">
            <table className="w-full"><thead className="sticky top-0 bg-slate-50 text-left text-slate-600"><tr>{['#', 'Name', 'Class', 'Parent', 'Mobile'].map((h) => <th key={h} className="px-2 py-1.5">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.slice(0, 50).map((r, i) => (
                <tr key={i} className={(check?.issues ?? []).some((x: any) => x.row === i + 2 && x.level === 'error') ? 'bg-red-50' : ''}><td className="px-2 py-1 text-slate-500">{i + 2}</td><td className="px-2 py-1">{r.name}</td>
                  <td className="px-2 py-1">{[r.className, r.section].filter(Boolean).join(' — ')}</td><td className="px-2 py-1">{r.parentName}</td><td className="px-2 py-1 font-mono">{r.parentPhone}</td></tr>))}</tbody></table>
            {rows.length > 50 && <p className="p-2 text-slate-600">…and {rows.length - 50} more</p>}
          </div>)}
        {dry.isPending && <p className="text-sm text-slate-600">Checking…</p>}
        {check && (
          <div className="space-y-2 text-sm">
            <p className="flex items-center gap-2">{errors.length ? <XCircle className="size-4 text-red-600" /> : <CheckCircle2 className="size-4 text-emerald-600" />}
              {check.summary.students} student(s){check.summary.withClass ? `, ${check.summary.withClass} into classes${check.summary.year ? ` (${check.summary.year})` : ''}` : ''}, {check.summary.newParents} new parent account(s){check.summary.linkedExistingParents ? `, ${check.summary.linkedExistingParents} linked to existing parents` : ''}.</p>
            {[...errors, ...warnings].length > 0 && <ul className="max-h-40 space-y-1 overflow-auto rounded-lg border border-slate-200 p-2">{[...errors, ...warnings].map((x: any, i: number) => (
              <li key={i} className={x.level === 'error' ? 'text-red-800' : 'text-amber-800'}>{x.level === 'error' ? <XCircle className="mr-1 inline size-3.5" /> : <AlertTriangle className="mr-1 inline size-3.5" />}Row {x.row}: {x.message}</li>))}</ul>}
            {errors.length > 0 && <p className="text-red-800">Fix these rows in the file and choose it again. Nothing has been imported.</p>}
          </div>)}
        {run.error ? <ErrorBox error={run.error} /> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => run.mutate()} loading={run.isPending} disabled={!check?.ok}><FileSpreadsheet className="size-4" />Import {rows.length || ''} student(s)</Button></div>
      </div>
    </Dialog>
  );
}
