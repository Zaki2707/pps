# Perpustakaan Digital Sekolah — MVP 0.2

Aplikasi web local-first untuk perpustakaan sekolah dengan dua PC:

- **PC Admin/Server**: PostgreSQL + backend + dashboard pustakawan + sirkulasi.
- **PC Siswa/Kiosk**: pencarian buku publik + absensi perpustakaan.
- **Scanner fleksibel**: scanner USB, kamera laptop/webcam, atau kamera HP yang membuka aplikasi melalui server yang sama.

## Fitur utama

- Halaman publik tanpa login untuk mencari buku dan melihat jumlah tersedia serta lokasi rak.
- Absensi kartu siswa/guru di halaman publik.
  - Saat halaman aktif digunakan, scan hanya memberi beep/notifikasi kecil.
  - Saat idle >30 detik, scan boleh menampilkan sambutan ±1,8 detik.
  - Cooldown kunjungan default 30 menit.
- Tombol **Scan kartu dengan kamera** pada PC siswa/kiosk.
- Tombol **Gunakan kamera** pada halaman sirkulasi admin.
- Kamera HP dapat dipakai dengan membuka aplikasi dari browser HP pada jaringan/server yang sama.
- Scanner USB tetap didukung dan tidak perlu diganti ketika perangkat scanner fisik sudah tersedia.
- Login pustakawan dengan password scrypt dan session cookie server-side.
- Dashboard statistik.
- Katalog buku + eksemplar terpisah.
- Barcode internal: `STU-YYYY-000001`, `TCH-YYYY-000001`, `BK-YYYY-000001`.
- Sirkulasi cepat:
  - scan anggota → scan buku → pinjam;
  - scan buku tanpa anggota aktif → kembalikan.
- Import Excel buku dan siswa melalui preview → validasi → commit.
- Download template Excel.
- Generator barcode Code 128 SVG di API.
- Tahun ajaran dan riwayat kelas siswa sudah disiapkan di database.
- Audit log dan `sync_queue` untuk pengembangan sinkronisasi cloud.

## Persiapan di PC Admin

1. Install Node.js 22+ dan PostgreSQL 16+.
2. Buat database:

```sql
CREATE DATABASE perpustakaan;
```

3. Salin `.env.example` menjadi `.env`, lalu isi `DATABASE_URL` dan password admin.
4. Install dependency:

```bash
npm install
```

5. Buat tabel dan admin pertama:

```bash
npm run db:init
```

6. Jalankan development:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:3001`

## Akses PC siswa / HP melalui router

Produksi: jalankan:

```bash
npm run build
npm start
```

PC siswa atau HP kemudian membuka alamat PC admin pada jaringan yang sama.

### Penting untuk kamera di LAN

Browser modern mengizinkan kamera pada **secure context**. `localhost` biasanya diizinkan, tetapi alamat HTTP LAN seperti `http://192.168.x.x` dapat ditolak untuk akses kamera.

Backend sekarang mendukung HTTPS opsional:

```env
HTTPS_KEY_FILE=C:\\cert\\perpus-key.pem
HTTPS_CERT_FILE=C:\\cert\\perpus-cert.pem
```

Gunakan sertifikat lokal yang dipercaya oleh perangkat sekolah, lalu buka server dengan `https://...`. Jika dua ENV di atas tidak diisi, server tetap berjalan melalui HTTP dan semua fitur selain kamera LAN tetap dapat digunakan.

## Cara memakai scanner

### PC siswa / kiosk

Pilihan input:
- scanner USB keyboard-wedge;
- webcam/kamera laptop melalui tombol **Scan kartu dengan kamera**;
- kamera HP dengan membuka halaman publik pada HP.

Hanya barcode anggota `STU-...` dan `TCH-...` yang diterima sebagai absensi. Scan tidak mengubah isi transaksi peminjaman.

### PC admin / sirkulasi

Pilihan input:
- scanner USB pada kolom scan;
- input manual;
- webcam/kamera laptop;
- kamera HP setelah login pustakawan pada browser HP dan membuka menu Sirkulasi.

Urutan:
- scan `STU-...` / `TCH-...` untuk memilih peminjam;
- scan `BK-...` setelah anggota aktif untuk menambahkan buku;
- scan `BK-...` saat tidak ada anggota aktif untuk pengembalian.

## Catatan keamanan

Halaman publik hanya dapat mencatat kunjungan dan membaca katalog. Endpoint pinjam/kembali tetap berada di bawah autentikasi pustakawan. Kamera tidak mengunggah video ke server; decoding barcode dilakukan di browser, kemudian hanya teks barcode yang dikirim ke API.

## Cloud

PostgreSQL lokal tetap menjadi source of truth untuk transaksi LAN. Cloud akan dikembangkan sebagai mirror/backup/remote access setelah aturan sinkronisasi idempotent dan resolusi konflik selesai diuji.
