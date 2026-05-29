# Provisioning Runbook

Panduan operasional buat bulk provisioning VPS lewat dashboard PBN. Ditulis casual buat operator (Sandi) — bukan dokumen formal, langsung to-the-point.

---

## 1. Pre-flight Checklist

Sebelum bulk order VPS, pastikan semua ini OK dulu. Skip salah satu = batch bakal gagal.

- [ ] **Worker daemon running** di RDP. Cek dengan `ps aux | grep worker_daemon` atau lihat terminal. Kalau mati, start ulang:
  ```bash
  cd /path/to/pbn-dashboard
  python worker_daemon.py
  ```
- [ ] **/provisioning Workers indicator HIJAU**. Buka halaman `/provisioning` di dashboard, cek widget Workers — harus hijau dengan `last beat < 60s`. Kalau kuning/merah = daemon stale, restart.
- [ ] **PROVISION_PASSWORD_KEY env var sync**. Key di Railway (backend) harus IDENTIK dengan key di RDP (worker). Kalau beda = decryption fail, password VPS gak kebaca worker.
  - Railway: Settings → Variables → `PROVISION_PASSWORD_KEY`
  - RDP: `.env` di project root, atau env shell
- [ ] **Master SSH key `pbn-bulk` ada di RDP**. Path standar: `~/.ssh/pbn-bulk` (private) + `~/.ssh/pbn-bulk.pub`. Kalau hilang, regenerate dan re-upload pub ke provider dashboard.
- [ ] **Internet RDP ke target provider OK**. Quick ping test sebelum submit batch:
  ```bash
  ping <provider-IP>
  ssh -i ~/.ssh/pbn-bulk root@<provider-IP> 'echo ok'
  ```
  Kalau timeout dari RDP, kemungkinan firewall provider belum allow IP RDP atau outbound RDP kena block.

---

## 2. Workflow Standar: Bulk Order VPS

Standard happy path. Ikutin urut-urutan, jangan skip.

### Step 1: Order di provider dashboard
Login ke provider (Contabo / IDCH / dll), order VPS sesuai tier yang dibutuhin. Save kredensial mentahnya — IP, root user, password — ke note sementara. Jangan commit ke git, jangan share di chat publik.

### Step 2: Paste creds di `/provisioning/new`
Buka `/provisioning/new` di dashboard. Paste creds dengan format CSV per baris:
```
LABEL,IP,USER,PASS
contabo-04-eu,123.45.67.89,root,SuperSecret123
contabo-05-eu,123.45.67.90,root,AnotherPass456
```
Label = nama internal yang nanti muncul di Server table. IP wajib valid. User biasanya `root`. Password = raw dari provider, nanti diencrypt sebelum disimpan.

### Step 3: Submit batch
Klik Submit. Backend bikin Batch row + N Task rows (pending status). Otomatis redirect ke `/provisioning/batches/:id`.

### Step 4: Monitor progress
Di halaman batch:
- UI auto-poll tiap 5 detik
- Status transitions: `pending` → `running` → `installing` → `completed` (atau `failed`)
- Setiap task punya `currentStep` field — visible di expand row, ngasih tau lagi di tahap apa (SSH connect, OLS install, BT panel setup, dll)
- Heartbeat timestamp per task — kalau stale > 60s, worker mungkin nyangkut

### Step 5: Verify
Setelah semua task `completed`:
- Cek `/provisioning` health page — semua server harus muncul di Server table dengan status active
- Assign domains via deploy queue scheduler (jangan langsung bulk, lihat section 6)

---

## 3. Troubleshooting

### Worker daemon offline
**Symptom:** Indicator merah di `/provisioning`, heartbeat > 60s.
**Fix:**
1. SSH/RDP ke mesin worker
2. Cek apakah process masih hidup: `ps aux | grep worker_daemon`
3. Restart: `python worker_daemon.py` (jalankan dalam tmux/screen biar persistent)
4. Tunggu 10 detik, refresh `/provisioning` — indicator harus hijau lagi

### Task stuck "running"
**Symptom:** Status `running` > 5 menit tanpa step change, heartbeat stale.
**Fix:** Tinggal restart daemon — `recover_stale_tasks()` di startup bakal auto-detect stale tasks (heartbeat lewat threshold), reset ke `pending`, dan re-claim. Gak perlu manual DB intervention.

### SSH timeout pas connect ke VPS
**Symptom:** Task fail dengan error `SSH connection timeout`.
**Fix:**
1. Ping VPS dari RDP: `ping <IP>` — kalau gak balas, VPS belum up atau IP salah
2. Manual SSH test: `ssh -i ~/.ssh/pbn-bulk root@<IP>` — kalau auth fail, key belum di-upload ke provider
3. Kalau VPS up tapi tetap timeout > 2 jam, escalate ke IDCH/provider support — bisa jadi firewall provider drop traffic dari RDP IP

### Error: `OLS_INSTALL_FAIL`
**Symptom:** Task fail di step install OpenLiteSpeed.
**Fix:**
1. Cek log task di dashboard (expand row → log viewer)
2. Klik Retry button — sering kali transient (apt lock, network blip)
3. Kalau retry kedua tetap gagal, manual SSH ke VPS, jalankan install command manual, lihat error real-time
4. Pitfall umum: `apt-daily.lock` ketrigger barengan — tunggu 10 menit baru retry

### Decryption error
**Symptom:** Worker log ngeluh decrypt fail / invalid key padding.
**Fix:** `PROVISION_PASSWORD_KEY` di Railway dan RDP gak match. Sync ulang:
1. Ambil value canonical dari Railway → Variables
2. Set ke RDP env / `.env`
3. Restart worker daemon
4. Re-trigger task yang fail (Retry button)

---

## 4. Emergency Rollback

Kalau dashboard broken parah (deploy backend ngerusak schema atau API), rollback prosedur:

1. **Revert backend commit**:
   ```bash
   git revert <bad-commit-sha>
   git push origin main
   ```
   Railway auto-redeploy ke commit sebelumnya.

2. **Stop worker daemon**: `Ctrl+C` di terminal worker, atau `kill <pid>`. Tujuannya cegah worker claim task baru sementara backend belum stabil.

3. **DB rows aman** — gak ada destructive op di rollback. Task rows tetap di DB dengan status terakhir. Aman re-claim setelah backend OK.

4. **Re-deploy setelah fix**:
   - Push fix commit
   - Railway redeploy
   - Restart worker: `python worker_daemon.py`
   - Resume task yang `pending` / `running` via Retry

**Jangan** drop tables, jangan truncate, jangan manual DELETE. Semua state recoverable lewat status transitions.

---

## 5. Tier Capacity Reference

Default cap per tier (RAM-based). Empirical numbers diisi setelah stress test JKT03 selesai.

| Tier | Default Cap | Empirical Cap | Status |
|------|-------------|---------------|--------|
| 1GB  | 12          | TBD           | Stress test JKT03 pending |
| 2GB  | 20          | TBD           | Belum di-test |
| 4GB  | 35          | TBD           | Belum di-test |
| 8GB  | 60          | TBD           | Belum di-test |

**Cara update:** Setelah stress test verdict, update kolom `capacity` di tabel `Server` (atau config tier mapping) sesuai empirical. Default cap konservatif — jangan langsung push ke max sebelum data nyata.

---

## 6. Anti-Spam Pace

**ATURAN PERMANEN — JANGAN OVERRIDE.**

Deploy queue scheduler **maksimal 10-15 domain/hari per VPS**. Ini bukan saran, ini hard rule.

**Kenapa:**
- Google detect cluster fast deploy = footprint terlihat
- Domain baru muncul bareng-bareng dari IP/ASN sama = pattern PBN yang gampang di-flag
- Slow drip = looks organic = SEO value preserved

**Yang dilarang:**
- Manual override scheduler buat push 50+ domain sekali deploy
- Bulk import domain langsung ke active state
- Skip queue, langsung set status = `live`

Scheduler udah throttle otomatis. Kalau pengen lebih cepet, tambah VPS, bukan tambah pace per VPS.

---

## 7. Status Transitions Glossary

Arti tiap status di task lifecycle:

| Status | Arti |
|--------|------|
| `pending` | Task ada di DB, queued, belum di-claim worker. Aman cancel di stage ini. |
| `running` | Worker udah claim, mulai eksekusi. Heartbeat update tiap N detik. |
| `installing` | Lagi di tengah install procedure (OLS, BT panel, dll). Lihat `currentStep` buat detail sub-stage. |
| `completed` | Task sukses. Server row otomatis di-insert ke `Server` table. Siap assign domain. |
| `failed` | Error di salah satu step. Log tersedia di task detail. Retry button available — sering transient, retry sekali biasanya cukup. |

**Transition diagram:**
```
pending -> running -> installing -> completed
                  \-> failed (retry-able)
```

Stale `running` task (heartbeat expired) di-auto-reset ke `pending` oleh `recover_stale_tasks()` saat daemon startup.
