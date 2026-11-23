<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ArtworkPortalController extends Controller
{
    public function profile(Request $r, int $id): array
    {
        abort_unless(Auth::user()->active && in_array(Auth::user()->role, ['owner', 'manager', 'accountant', 'warehouse']), 403);
        $c = DB::table('contacts')->find($id);
        abort_unless($c && $c->kind === 'customer', 404);
        $v = $r->validate(['name' => 'required|string|max:150', 'phone' => 'nullable|string|max:40', 'email' => 'nullable|email|max:150', 'address' => 'nullable|string|max:1000']);

        return DB::transaction(function () use ($id, $c, $v) {
            DB::table('contacts')->where('id', $id)->update($v + ['updated_at' => now()]);
            if (($v['phone'] ?? '') !== ($c->phone ?? '')) {
                DB::table('artwork_links')->where('contact_id', $id)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
            }

            return ['ok' => true];
        });
    }

    private function staffProject(int $id): object
    {
        $u = Auth::user();
        abort_unless($u && $u->active && in_array($u->role, ['owner', 'manager', 'designer']), 403);
        $p = DB::table('projects')->find($id);
        abort_unless($p, 404);
        if ($u->role === 'designer') {
            abort_unless($p->assigned_id === $u->id || $p->user_id === $u->id, 403);
        }

        return $p;
    }

    public static function phone(string $value): string
    {
        $phone = preg_replace('/[\s()+.\-]/', '', $value);
        if (str_starts_with($phone, '00')) {
            $phone = substr($phone, 2);
        }
        if (! preg_match('/^[1-9][0-9]{7,14}$/', $phone)) {
            throw ValidationException::withMessages(['phone' => __('Enter a phone number with its country code, for example +971501234567.')]);
        }

        return $phone;
    }

    public function manage(Request $r, int $id): array
    {
        $this->staffProject($id);

        return DB::transaction(function () use ($r, $id) {
            $p = DB::table('projects')->where('id', $id)->lockForUpdate()->first();
            if ($r->isMethod('post')) {
                $v = $r->validate(['action' => 'required|in:create,revoke', 'allow_upload' => 'sometimes|boolean']);
                DB::table('artwork_links')->where('project_id', $id)->whereNull('revoked_at')->update(['revoked_at' => now(), 'updated_at' => now()]);
                if ($v['action'] === 'create') {
                    abort_if($p->status === 'Delivered', 422, __('Delivered projects are locked.'));
                    $c = DB::table('contacts')->find($p->contact_id);
                    abort_unless($c && $c->kind === 'customer', 422, __('Link a customer before creating an artwork link.'));
                    self::phone($c->phone ?? '');
                    $token = bin2hex(random_bytes(32));
                    DB::table('artwork_links')->insert(['project_id' => $id, 'contact_id' => $c->id, 'created_by' => Auth::id(), 'token_hash' => hash('sha256', $token), 'encrypted_token' => Crypt::encryptString($token), 'allow_upload' => $v['allow_upload'] ?? true, 'expires_at' => now()->addDays(30), 'created_at' => now(), 'updated_at' => now()]);
                }
                DB::table('audit')->insert(['user_id' => Auth::id(), 'action' => 'artwork.link.'.$v['action'], 'subject' => 'project:'.$id, 'details' => '{}', 'created_at' => now()]);
            }
            $link = DB::table('artwork_links')->where('project_id', $id)->where('contact_id', $p->contact_id)->whereNull('revoked_at')->where('expires_at', '>', now())->latest('id')->first();
            if (! $link) {
                return ['link' => null];
            }
            $customer = DB::table('contacts')->find($p->contact_id);
            $url = url('/artwork-review/'.Crypt::decryptString($link->encrypted_token));
            $text = 'Hello '.$customer->name.', please upload or review the artwork for '.$p->name.': '.$url;

            return ['link' => ['url' => $url, 'expires_at' => $link->expires_at, 'allow_upload' => (bool) $link->allow_upload, 'customer' => $customer->name, 'phone' => $customer->phone, 'whatsapp_url' => 'https://wa.me/'.self::phone($customer->phone).'?text='.rawurlencode($text)]];
        });
    }

    private function link(string $token): object
    {
        abort_unless(preg_match('/^[a-f0-9]{64}$/', $token), 404);
        $link = DB::table('artwork_links')->where('token_hash', hash('sha256', $token))->whereNull('revoked_at')->where('expires_at', '>', now())->first();
        abort_unless($link, 404, __('This artwork link has expired or been closed.'));
        $p = DB::table('projects')->find($link->project_id);
        abort_unless($p && $p->contact_id === $link->contact_id, 404);

        return $link;
    }

    private function identity(Request $r, object $link): array
    {
        $v = $r->validate(['name' => 'required|string|max:150', 'phone' => 'required|string|max:40']);
        $phone = self::phone($v['phone']);
        $expected = self::phone(DB::table('contacts')->where('id', $link->contact_id)->value('phone') ?? '');
        if (! hash_equals($expected, $phone)) {
            throw ValidationException::withMessages(['phone' => __('Use the phone number registered for this customer. Contact the studio if it needs updating.')]);
        }

        return ['customer_name' => trim($v['name']), 'customer_phone' => $phone, 'source' => 'customer', 'artwork_link_id' => $link->id, 'user_id' => null];
    }

    public function page(string $token): Response
    {
        $this->link($token);

        return response()->view('artwork-review')->withHeaders(['Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer', 'X-Robots-Tag' => 'noindex, nofollow']);
    }

    public function data(string $token): array
    {
        $link = $this->link($token);
        $p = DB::table('projects')->find($link->project_id);
        $artworks = DB::table('artworks')->where('project_id', $p->id)->orderByDesc('version')->get(['id', 'version', 'filename', 'mime', 'source', 'created_at']);
        $approvals = DB::table('approvals')->where('project_id', $p->id)->where('source', 'customer')->orderByDesc('id')->get(['artwork_id', 'decision', 'customer_name', 'created_at']);

        return ['company' => DB::table('settings')->where('key', 'company_name')->value('value'), 'project' => ['name' => $p->name, 'status' => $p->status, 'approved_artwork_id' => $p->approved_artwork_id], 'allow_upload' => (bool) $link->allow_upload && $p->status !== 'Delivered', 'expires_at' => $link->expires_at, 'artworks' => $artworks, 'approvals' => $approvals];
    }

    public function file(string $token, int $id): StreamedResponse
    {
        $link = $this->link($token);
        $a = DB::table('artworks')->where('project_id', $link->project_id)->find($id);
        abort_unless($a, 404);

        return Storage::disk('local')->response($a->path, $a->filename, ['Content-Type' => $a->mime, 'X-Content-Type-Options' => 'nosniff', 'Cache-Control' => 'no-store', 'Referrer-Policy' => 'no-referrer', 'Content-Security-Policy' => "default-src 'none'; sandbox"]);
    }

    public function upload(Request $r, string $token): array
    {
        $link = $this->link($token);
        abort_unless($link->allow_upload, 403, __('Uploads are closed for this link.'));
        $identity = $this->identity($r, $link);
        $r->validate(['file' => 'required|file|mimes:pdf,png,jpg,jpeg,webp|max:16384', 'comment' => 'nullable|string|max:2000']);
        $f = $r->file('file');
        $path = $f->store('artwork', 'local');
        try {
            return DB::transaction(function () use ($link, $identity, $r, $f, $path, $token) {
                $p = DB::table('projects')->where('id', $link->project_id)->lockForUpdate()->first();
                $this->link($token);
                abort_if($p->status === 'Delivered', 422, __('Delivered projects are locked.'));
                abort_if(DB::table('artworks')->where('project_id', $p->id)->count() >= 100, 422, __('Please contact the studio to add more revisions.'));
                $id = DB::table('artworks')->insertGetId($identity + ['project_id' => $p->id, 'version' => 1 + (int) DB::table('artworks')->where('project_id', $p->id)->max('version'), 'path' => $path, 'filename' => Str::limit(basename($f->getClientOriginalName()), 150, ''), 'mime' => $f->getMimeType(), 'comment' => $r->input('comment'), 'created_at' => now(), 'updated_at' => now()]);
                $events = array_map(fn ($e) => $e['stage'] === 'packaging_ready' ? array_merge($e, ['stage' => 'packaging_superseded']) : $e, json_decode($p->workflow_events ?? '[]', true));
                DB::table('projects')->where('id', $p->id)->update(['status' => 'Review', 'approved_artwork_id' => null, 'workflow_events' => json_encode($events), 'updated_at' => now()]);
                $this->audit('artwork.customer_upload', $p->id, $id, $identity);

                return ['id' => $id];
            });
        } catch (\Throwable $e) {
            Storage::disk('local')->delete($path);
            throw $e;
        }
    }

    public function decide(Request $r, string $token): array
    {
        $link = $this->link($token);
        $identity = $this->identity($r, $link);
        $v = $r->validate(['artwork_id' => 'required|integer', 'decision' => 'required|in:approve,revise', 'comment' => 'nullable|string|max:2000', 'consent' => 'required|accepted']);

        return DB::transaction(function () use ($link, $identity, $v, $token) {
            $p = DB::table('projects')->where('id', $link->project_id)->lockForUpdate()->first();
            $this->link($token);
            abort_if($p->status === 'Delivered', 422, __('Delivered projects are locked.'));
            $a = DB::table('artworks')->where('project_id', $p->id)->latest('version')->first();
            abort_unless($a && $a->id === $v['artwork_id'], 409, __('The artwork has changed. Reload and review the latest version.'));
            if ($v['decision'] === 'approve' && $p->approved_artwork_id === $a->id) {
                return ['ok' => true];
            }
            DB::table('approvals')->insert($identity + ['project_id' => $p->id, 'artwork_id' => $a->id, 'decision' => $v['decision'], 'comment' => $v['comment'] ?? '', 'created_at' => now()]);
            $update = ['status' => $v['decision'] === 'approve' ? 'Approved' : 'Revision', 'approved_artwork_id' => $v['decision'] === 'approve' ? $a->id : null, 'updated_at' => now()];
            if ($v['decision'] === 'revise') {
                $update['workflow_events'] = json_encode(array_map(fn ($e) => $e['stage'] === 'packaging_ready' ? array_merge($e, ['stage' => 'packaging_superseded']) : $e, json_decode($p->workflow_events ?? '[]', true)));
            }
            DB::table('projects')->where('id', $p->id)->update($update);
            $this->audit('artwork.customer_'.$v['decision'], $p->id, $a->id, $identity);

            return ['ok' => true];
        });
    }

    private function audit(string $action, int $project, int $artwork, array $identity): void
    {
        DB::table('audit')->insert(['user_id' => null, 'action' => $action, 'subject' => 'project:'.$project, 'details' => json_encode(['artwork_id' => $artwork, 'customer_name' => $identity['customer_name'], 'customer_phone' => $identity['customer_phone']]), 'created_at' => now()]);
    }
}
