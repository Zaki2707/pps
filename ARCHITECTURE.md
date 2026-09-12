# Arsitektur yang Dikunci

## Perangkat

### PC Admin / Server
- PostgreSQL lokal sebagai sumber data operasional utama.
- Backend API dan frontend produksi berjalan di PC yang sama.
- Dashboard pustakawan.
- Input sirkulasi dapat berasal dari scanner USB, input manual, webcam, atau kamera HP yang login ke server.
- Nantinya sinkronisasi cloud dan backup berjalan dari PC ini.

### PC Siswa / Kiosk
- Terhubung ke PC Admin melalui router/LAN.
- Halaman utama katalog publik tanpa login.
- Absensi dapat memakai scanner USB atau webcam/kamera.
- Bila halaman sedang dipakai mencari buku, scan tidak mengganggu pencarian: hanya beep/notifikasi kecil.
- Bila idle >30 detik, scan boleh menampilkan sambutan singkat lalu kembali ke katalog.

### HP / perangkat tambahan
- Tidak membutuhkan aplikasi native.
- Membuka web app dari server yang sama.
- Kamera HP dapat menjadi sumber scan barcode.
- Untuk sirkulasi, HP tetap harus login sebagai pustakawan karena endpoint transaksi dilindungi autentikasi.

## Scan Engine

Sumber input bersifat fleksibel:

```text
Scanner USB ─┐
Kamera PC ───┼─> normalisasi barcode ─> konteks absensi / sirkulasi
Kamera HP ───┤
Manual ──────┘
```

Format internal:
- Siswa: `STU-YYYY-000001`
- Guru: `TCH-YYYY-000001`
- Eksemplar buku: `BK-YYYY-000001`
- ISBN/EAN dapat dibaca kamera untuk pengembangan input katalog, tetapi bukan identitas eksemplar fisik.

Video kamera diproses di browser. Server menerima teks hasil barcode, bukan stream video.

## HTTPS kamera

Akses kamera browser dari perangkat LAN memerlukan secure context. Server mendukung TLS jika `HTTPS_KEY_FILE` dan `HTTPS_CERT_FILE` disediakan. Tanpa TLS, fungsi inti LAN tetap bekerja tetapi browser dapat menolak kamera pada alamat selain localhost.

## Model data inti
1. `books` = katalog/judul.
2. `book_copies` = setiap buku fisik yang memiliki barcode sendiri.
3. `students` / `teachers` = anggota.
4. `loans` + `loan_items` = sirkulasi.
5. `library_visits` = absensi/kunjungan, terpisah total dari peminjaman.
6. `student_enrollments` + `academic_years` = riwayat kelas per tahun ajaran.

## Aturan default
- Siswa: maksimal 3 buku, 7 hari.
- Guru: maksimal 10 buku, 30 hari.
- Kunjungan: check-in saja, cooldown 30 menit.
- Status eksemplar: available, borrowed, reserved, damaged, lost, repair, withdrawn.
- Data historis tidak dihapus ketika siswa lulus atau buku ditarik dari inventaris.

## Prinsip local-first
Internet tidak diperlukan untuk pencarian, absensi, pinjam, kembali, tambah buku, dan import Excel selama LAN dan PC Admin aktif.

Cloud bukan dependency transaksi harian. Tahap cloud akan berfungsi sebagai mirror/backup/remote access dengan aturan sinkronisasi yang aman dan idempotent.
