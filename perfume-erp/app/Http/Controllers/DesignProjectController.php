<?php

namespace App\Http\Controllers;

use App\Services\Amounts;
use App\Services\Documents;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Design and packaging projects, artwork versions and workflow stages.
 */
class DesignProjectController extends ErpBaseController
{
    public function projects(Request $r)
    {
        $this->allow(['manager', 'designer']);
        if ($r->isMethod('post')) {
            $v = $r->validate(['name' => 'required|string|max:150', 'contact_id' => 'nullable|exists:contacts,id', 'type' => ['required', Rule::in(['Design', 'Printing', 'Packaging', 'Private Label'])], 'brief' => 'required|string|max:6000', 'due_date' => 'nullable|date', 'assigned_id' => 'nullable|exists:users,id', 'charge' => 'required', 'cost' => 'required', 'specification' => 'nullable|string|max:3000', 'product_id' => 'nullable|exists:products,id', 'batch_id' => 'nullable|exists:batches,id', 'supplier_id' => 'nullable|exists:contacts,id']);
            if (Auth::user()->role === 'designer' && (Amounts::parse($v['charge']) || Amounts::parse($v['cost']))) {
                abort(403, 'Managers set financial charges.');
            }if (! empty($v['contact_id']) && DB::table('contacts')->where('id', $v['contact_id'])->value('kind') !== 'customer') {
                Documents::fail('Choose a customer.');
            }
            if (! empty($v['supplier_id']) && DB::table('contacts')->where('id', $v['supplier_id'])->value('kind') !== 'supplier') {
                Documents::fail('Choose a supplier.');
            }
            if (! empty($v['batch_id']) && DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->where('b.id', $v['batch_id'])->value('f.product_id') != ($v['product_id'] ?? null)) {
                Documents::fail('Batch must produce the selected product.');
            }
            $v['charge_cents'] = Amounts::parse($v['charge']);
            $v['cost_cents'] = Amounts::parse($v['cost']);
            unset($v['charge'],$v['cost']);

            return ['id' => DB::table('projects')->insertGetId($v + ['user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()])];
        }$q = DB::table('projects as p')->leftJoin('contacts as c', 'c.id', '=', 'p.contact_id')->leftJoin('users as u', 'u.id', '=', 'p.assigned_id')->select('p.*', 'c.name as customer', 'u.name as designer');
        if (Auth::user()->role === 'designer') {
            $q->where(function ($x) {
                $x->where('p.assigned_id', Auth::id())->orWhere('p.user_id', Auth::id());
            });
        }$projects = $q->orderByDesc('p.id')->get();
        foreach ($projects as $p) {
            $p->artworks = DB::table('artworks')->where('project_id', $p->id)->orderByDesc('version')->get();
            $p->approvals = DB::table('approvals')->where('project_id', $p->id)->get();
            if (Auth::user()->role === 'designer') {
                unset($p->charge_cents,$p->cost_cents);
            }
        }

        return ['projects' => $projects];
    }

    private function projectAccess(int $id): object
    {
        $p = DB::table('projects')->find($id);
        abort_unless($p, 404);
        if (Auth::user()->role === 'designer') {
            abort_unless($p->assigned_id === Auth::id() || $p->user_id === Auth::id(), 403);
        }

        return $p;
    }

    public function uploadArtwork(Request $r, int $id)
    {
        $this->allow(['manager', 'designer']);
        $p = $this->projectAccess($id);
        if ($p->status === 'Delivered') {
            Documents::fail('Delivered projects cannot receive revisions.');
        }$r->validate(['file' => 'required|file|mimes:pdf,png,jpg,jpeg,webp|max:16384', 'comment' => 'nullable|string|max:2000']);
        $f = $r->file('file');
        $path = $f->store('artwork', 'local');

        return DB::transaction(function () use ($id, $r, $f, $path, $p) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            abort_if($p->status === 'Delivered', 422, 'Delivered projects are locked.');
            $version = 1 + (int) DB::table('artworks')->where('project_id', $id)->max('version');
            $aid = DB::table('artworks')->insertGetId(['project_id' => $id, 'version' => $version, 'path' => $path, 'filename' => basename($f->getClientOriginalName()), 'mime' => $f->getMimeType(), 'comment' => $r->input('comment'), 'user_id' => Auth::id(), 'created_at' => now(), 'updated_at' => now()]);
            DB::table('projects')->where('id', $id)->update(['status' => 'Review', 'approved_artwork_id' => null, 'workflow_events' => json_encode(array_map(fn ($e) => $e['stage'] === 'packaging_ready' ? array_merge($e, ['stage' => 'packaging_superseded']) : $e, json_decode($p->workflow_events ?? '[]', true))), 'updated_at' => now()]);

            return ['id' => $aid];
        });
    }

    public function artwork(int $id)
    {
        $this->allow(['manager', 'designer']);
        $a = DB::table('artworks')->find($id);
        abort_unless($a, 404);
        $this->projectAccess($a->project_id);

        return Storage::disk('local')->download($a->path, $a->filename, ['X-Content-Type-Options' => 'nosniff']);
    }

    public function projectAction(Request $r, int $id)
    {
        $this->allow(['manager']);
        $p = $this->projectAccess($id);
        $v = $r->validate(['action' => ['required', Rule::in(['approve', 'revise', 'deliver'])], 'artwork_id' => 'nullable|integer', 'comment' => 'required|string|max:2000']);

        return DB::transaction(function () use ($v, $id) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            if ($v['action'] === 'deliver') {
                if ($p->status !== 'Approved' || ! $p->approved_artwork_id) {
                    Documents::fail('Approve the artwork before delivery.');
                }DB::table('projects')->where('id', $id)->update(['status' => 'Delivered', 'updated_at' => now()]);
            } else {
                $a = DB::table('artworks')->where(['id' => $v['artwork_id'] ?? 0, 'project_id' => $id])->first();
                if (! $a || $a->version !== DB::table('artworks')->where('project_id', $id)->max('version')) {
                    Documents::fail('Review the latest artwork version.');
                }if ($p->status === 'Delivered') {
                    Documents::fail('Delivered project is locked.');
                }DB::table('approvals')->insert(['project_id' => $id, 'artwork_id' => $a->id, 'user_id' => Auth::id(), 'decision' => $v['action'], 'comment' => $v['comment'], 'created_at' => now()]);
                DB::table('projects')->where('id', $id)->update(['status' => $v['action'] === 'approve' ? 'Approved' : 'Revision', 'approved_artwork_id' => $v['action'] === 'approve' ? $a->id : null, 'updated_at' => now()]);
            }$this->audit('project.'.$v['action'], 'project:'.$id);

            return ['ok' => true];
        });
    }

    public function projectLinks(Request $r, int $id): array
    {
        $this->allow(['manager']);
        $v = $r->validate(['contact_id' => 'nullable|exists:contacts,id', 'product_id' => 'nullable|exists:products,id', 'batch_id' => 'nullable|exists:batches,id', 'supplier_id' => 'nullable|exists:contacts,id']);
        $p = DB::table('projects')->find($id);
        abort_unless($p, 404);
        if ($p->workflow_events && array_filter(json_decode($p->workflow_events, true), fn ($e) => $e['stage'] === 'vendor_started') && ($v['supplier_id'] ?? null) != $p->supplier_id) {
            Documents::fail('Vendor is locked after work starts.');
        }if ($p->status === 'Delivered') {
            Documents::fail('Delivered links are locked.');
        }if (! empty($v['contact_id']) && DB::table('contacts')->where('id', $v['contact_id'])->value('kind') !== 'customer') {
            Documents::fail('Choose a customer.');
        }if (! empty($v['supplier_id']) && DB::table('contacts')->where('id', $v['supplier_id'])->value('kind') !== 'supplier') {
            Documents::fail('Choose a supplier.');
        }if (! empty($v['batch_id']) && DB::table('batches as b')->join('formulas as f', 'f.id', '=', 'b.formula_id')->where('b.id', $v['batch_id'])->value('f.product_id') != ($v['product_id'] ?? null)) {
            Documents::fail('The batch must produce the selected product.');
        }DB::table('projects')->where('id', $id)->update($v + ['updated_at' => now()]);
        $this->audit('project.links', $id);

        return ['ok' => true];
    }

    public function projectWorkflow(Request $r, int $id): array
    {
        $this->allow(['manager']);
        $v = $r->validate(['stage' => ['required', Rule::in(['vendor_started', 'vendor_finished', 'packaging_ready', 'delivered'])], 'notes' => 'required|string|max:3000', 'performed_at' => 'nullable|date']);

        return $this->once($r, 'project.workflow', function () use ($id, $v) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            abort_unless($p, 404);
            $events = json_decode($p->workflow_events ?? '[]', true);
            $stages = array_column($events, 'stage');
            if (in_array($v['stage'], $stages)) {
                Documents::fail('This stage is already recorded.');
            }if (in_array('delivered', $stages)) {
                Documents::fail('Delivered workflow is locked.');
            }if ($v['stage'] === 'vendor_started' && ! $p->supplier_id) {
                Documents::fail('Link a supplier to this project first.');
            }if ($v['stage'] === 'vendor_finished' && ! in_array('vendor_started', $stages)) {
                Documents::fail('Record vendor start first.');
            }if ($v['stage'] === 'packaging_ready' && ! $p->approved_artwork_id) {
                Documents::fail('Approve the artwork before marking packaging ready.');
            }if ($v['stage'] === 'delivered') {
                if (! in_array('packaging_ready', $stages)) {
                    Documents::fail('Record packaging readiness first.');
                }if ($p->batch_id && DB::table('batches')->where('id', $p->batch_id)->value('status') !== 'Completed') {
                    Documents::fail('Complete the linked production batch before delivery.');
                }
            }$at = ! empty($v['performed_at']) ? Carbon::parse($v['performed_at']) : now();
            if ($at->gt(now())) {
                Documents::fail('Stage completion cannot be in the future.');
            }if ($v['stage'] === 'vendor_finished') {
                foreach ($events as $event) {
                    if ($event['stage'] === 'vendor_started' && $at->lt(Carbon::parse($event['at']))) {
                        Documents::fail('Vendor completion cannot be before vendor start.');
                    }
                }
            }$events[] = ['stage' => $v['stage'], 'at' => $at->toIso8601String(), 'recorded_at' => now()->toIso8601String(), 'notes' => $v['notes']];
            DB::table('projects')->where('id', $id)->update(['workflow_events' => json_encode($events), 'status' => $v['stage'] === 'delivered' ? 'Delivered' : $p->status, 'updated_at' => now()]);
            $this->audit('project.workflow', $id);

            return ['ok' => true];
        });
    }
}
