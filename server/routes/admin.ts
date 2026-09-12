import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import bwipjs from 'bwip-js';
import { pool, tx } from '../lib/db.js';
import { audit } from '../lib/audit.js';
import { nextCopyCode, nextMemberCode, normalizeCode } from '../lib/codes.js';
import { findMemberByCode } from '../services/members.js';

export const adminRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function currentAcademicYearLabel() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? `${y}/${y + 1}` : `${y - 1}/${y}`;
}

async function getSettingNumber(key: string, fallback: number) {
  const { rows } = await pool.query(`SELECT value #>> '{}' AS value FROM library_settings WHERE key=$1`, [key]);
  const n = Number(rows[0]?.value);
  return Number.isFinite(n) ? n : fallback;
}

adminRouter.get('/stats', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM books)::int AS titles,
      (SELECT COUNT(*) FROM book_copies WHERE status <> 'withdrawn')::int AS copies,
      (SELECT COUNT(*) FROM book_copies WHERE status='available')::int AS available,
      (SELECT COUNT(*) FROM book_copies WHERE status='borrowed')::int AS borrowed,
      (SELECT COUNT(*) FROM loan_items WHERE status='borrowed' AND due_at < now())::int AS overdue,
      (SELECT COUNT(*) FROM students WHERE status='active')::int AS members,
      (SELECT COUNT(*) FROM library_visits WHERE scanned_at::date=CURRENT_DATE)::int AS visits_today
  `);
  res.json(rows[0]);
});

adminRouter.get('/member/:code', async (req, res) => {
  const member = await findMemberByCode(req.params.code);
  if (!member) return res.status(404).json({ error: 'Anggota tidak ditemukan.' });
  const maxBooks = await getSettingNumber(member.type === 'student' ? 'student_max_books' : 'teacher_max_books', member.type === 'student' ? 3 : 10);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM loans l JOIN loan_items li ON li.loan_id=l.id
     WHERE l.member_type=$1 AND l.member_id=$2 AND li.status='borrowed'`, [member.type, member.id]);
  res.json({ ...member, activeLoans: rows[0].count, maxBooks });
});

adminRouter.get('/copy/:code', async (req, res) => {
  const code = normalizeCode(req.params.code);
  const { rows } = await pool.query(
    `SELECT bc.id, bc.copy_code, bc.status, bc.condition, b.id AS book_id, b.title, b.author_text,
            li.id AS active_loan_item_id, li.due_at, l.member_type, l.member_id,
            COALESCE(st.name,t.name) AS borrower_name
     FROM book_copies bc JOIN books b ON b.id=bc.book_id
     LEFT JOIN loan_items li ON li.book_copy_id=bc.id AND li.status='borrowed'
     LEFT JOIN loans l ON l.id=li.loan_id
     LEFT JOIN students st ON l.member_type='student' AND st.id=l.member_id
     LEFT JOIN teachers t ON l.member_type='teacher' AND t.id=l.member_id
     WHERE bc.copy_code=$1`, [code]);
  if (!rows[0]) return res.status(404).json({ error: 'Eksemplar tidak ditemukan.' });
  res.json(rows[0]);
});

adminRouter.post('/loans', async (req, res) => {
  const memberCode = normalizeCode(String(req.body?.memberCode || ''));
  const copyCodes = Array.isArray(req.body?.copyCodes) ? req.body.copyCodes.map((x: unknown) => normalizeCode(String(x))) : [];
  if (!copyCodes.length) return res.status(400).json({ error: 'Belum ada buku yang dipilih.' });
  const member = await findMemberByCode(memberCode);
  if (!member || member.status !== 'active') return res.status(400).json({ error: 'Anggota tidak valid.' });
  const maxBooks = await getSettingNumber(member.type === 'student' ? 'student_max_books' : 'teacher_max_books', member.type === 'student' ? 3 : 10);
  const loanDays = await getSettingNumber(member.type === 'student' ? 'student_loan_days' : 'teacher_loan_days', member.type === 'student' ? 7 : 30);

  const result = await tx(async client => {
    const active = await client.query(
      `SELECT COUNT(*)::int AS count FROM loans l JOIN loan_items li ON li.loan_id=l.id
       WHERE l.member_type=$1 AND l.member_id=$2 AND li.status='borrowed'`, [member.type, member.id]);
    if (active.rows[0].count + copyCodes.length > maxBooks) throw new Error(`Melebihi batas maksimal ${maxBooks} buku.`);

    const copies = await client.query(
      `SELECT id, copy_code, status FROM book_copies WHERE copy_code = ANY($1::text[]) FOR UPDATE`, [copyCodes]);
    if (copies.rows.length !== copyCodes.length) throw new Error('Ada barcode buku yang tidak ditemukan.');
    const unavailable = copies.rows.find(r => r.status !== 'available');
    if (unavailable) throw new Error(`${unavailable.copy_code} tidak tersedia.`);

    const loan = await client.query(
      `INSERT INTO loans(member_type, member_id, created_by) VALUES($1,$2,$3) RETURNING id,loaned_at`,
      [member.type, member.id, req.user!.id]);
    const dueAt = new Date(Date.now() + loanDays * 86400000);
    for (const copy of copies.rows) {
      await client.query(
        `INSERT INTO loan_items(loan_id,book_copy_id,due_at) VALUES($1,$2,$3)`, [loan.rows[0].id, copy.id, dueAt]);
      await client.query(`UPDATE book_copies SET status='borrowed',updated_at=now() WHERE id=$1`, [copy.id]);
    }
    return { loanId: loan.rows[0].id, dueAt, count: copies.rows.length };
  });
  await audit(req.user?.id, 'loan.create', 'loan', result.loanId, { memberCode, copyCodes });
  res.json({ ok: true, ...result });
});

adminRouter.post('/returns', async (req, res) => {
  const copyCode = normalizeCode(String(req.body?.copyCode || ''));
  const result = await tx(async client => {
    const copy = await client.query(`SELECT id, status FROM book_copies WHERE copy_code=$1 FOR UPDATE`, [copyCode]);
    if (!copy.rows[0]) throw new Error('Barcode buku tidak ditemukan.');
    if (copy.rows[0].status !== 'borrowed') throw new Error('Buku ini tidak sedang dipinjam.');
    const item = await client.query(
      `SELECT li.id, li.loan_id, li.due_at, b.title, COALESCE(s.name,t.name) AS borrower_name
       FROM loan_items li
       JOIN loans l ON l.id=li.loan_id
       JOIN book_copies bc ON bc.id=li.book_copy_id
       JOIN books b ON b.id=bc.book_id
       LEFT JOIN students s ON l.member_type='student' AND s.id=l.member_id
       LEFT JOIN teachers t ON l.member_type='teacher' AND t.id=l.member_id
       WHERE li.book_copy_id=$1 AND li.status='borrowed' FOR UPDATE`, [copy.rows[0].id]);
    if (!item.rows[0]) throw new Error('Transaksi peminjaman aktif tidak ditemukan.');
    await client.query(`UPDATE loan_items SET status='returned',returned_at=now() WHERE id=$1`, [item.rows[0].id]);
    await client.query(`UPDATE book_copies SET status='available',updated_at=now() WHERE id=$1`, [copy.rows[0].id]);
    await client.query(
      `UPDATE loans SET completed_at=now() WHERE id=$1 AND NOT EXISTS(SELECT 1 FROM loan_items WHERE loan_id=$1 AND status='borrowed')`,
      [item.rows[0].loan_id]);
    const lateDays = Math.max(0, Math.ceil((Date.now() - new Date(item.rows[0].due_at).getTime()) / 86400000));
    return { title: item.rows[0].title, borrowerName: item.rows[0].borrower_name, lateDays };
  });
  await audit(req.user?.id, 'loan.return', 'book_copy', copyCode, result);
  res.json({ ok: true, ...result });
});

adminRouter.get('/books', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT b.id,b.isbn,b.title,b.author_text,b.publisher,b.publication_year,c.name AS category,s.code AS shelf_code,
           COUNT(bc.id)::int AS total,
           COUNT(bc.id) FILTER(WHERE bc.status='available')::int AS available
    FROM books b LEFT JOIN categories c ON c.id=b.category_id LEFT JOIN shelves s ON s.id=b.shelf_id
    LEFT JOIN book_copies bc ON bc.book_id=b.id AND bc.status<>'withdrawn'
    GROUP BY b.id,c.name,s.code ORDER BY b.title LIMIT 1000`);
  res.json(rows);
});

adminRouter.post('/books', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const quantity = Math.max(1, Math.min(Number(req.body?.quantity || 1), 1000));
  if (!title) return res.status(400).json({ error: 'Judul wajib diisi.' });
  const result = await tx(async client => {
    let categoryId = null, shelfId = null;
    const category = String(req.body?.category || '').trim();
    const shelf = String(req.body?.shelf || '').trim();
    if (category) {
      const q = await client.query(`INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [category]);
      categoryId = q.rows[0].id;
    }
    if (shelf) {
      const q = await client.query(`INSERT INTO shelves(code) VALUES($1) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [shelf]);
      shelfId = q.rows[0].id;
    }
    const book = await client.query(
      `INSERT INTO books(isbn,title,author_text,publisher,publication_year,category_id,shelf_id)
       VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [req.body?.isbn || null,title,req.body?.author || null,req.body?.publisher || null,req.body?.year || null,categoryId,shelfId]);
    const codes: string[] = [];
    for (let i=0;i<quantity;i++) {
      const code = await nextCopyCode(client); codes.push(code);
      await client.query(`INSERT INTO book_copies(book_id,copy_code) VALUES($1,$2)`, [book.rows[0].id,code]);
    }
    return { bookId: book.rows[0].id, codes };
  });
  await audit(req.user?.id, 'book.create', 'book', result.bookId, { title, quantity });
  res.json({ ok: true, ...result });
});

adminRouter.get('/barcode/:code.svg', async (req, res) => {
  const code = normalizeCode(req.params.code);
  const svg = bwipjs.toSVG({ bcid: 'code128', text: code, scale: 2, height: 10, includetext: true, textxalign: 'center' });
  res.type('image/svg+xml').send(svg);
});

adminRouter.get('/import/template/:kind', async (req, res) => {
  const kind = req.params.kind;
  let rows: Record<string, unknown>[];
  if (kind === 'books') {
    rows = [{ ISBN: '9780000000000', Judul: 'Contoh Buku', Penulis: 'Nama Penulis', Penerbit: 'Penerbit', Tahun: 2026, Kategori: 'Pelajaran', Rak: 'A-01', Jumlah: 3 }];
  } else if (kind === 'students') {
    rows = [{ NIS: '001', NISN: '1234567890', Nama: 'Ahmad Fauzan', Kelas: 'XI-A', JK: 'L', TahunAjaran: currentAcademicYearLabel() }];
  } else return res.status(404).end();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Template');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename=template-${kind}.xlsx`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
});

function rowsFromExcel(buffer: Buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

adminRouter.post('/import/:kind/preview', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File Excel belum dipilih.' });
  const kind = req.params.kind;
  if (!['books','students'].includes(kind)) return res.status(404).end();
  const rows = rowsFromExcel(req.file.buffer);
  const errors: { row: number; error: string }[] = [];
  rows.forEach((row, i) => {
    if (kind === 'books' && !String(row.Judul || row.judul || '').trim()) errors.push({ row: i + 2, error: 'Judul kosong' });
    if (kind === 'students' && !String(row.Nama || row.nama || '').trim()) errors.push({ row: i + 2, error: 'Nama kosong' });
  });
  const { rows: job } = await pool.query(
    `INSERT INTO import_jobs(kind,filename,payload,summary,created_by)
     VALUES($1,$2,$3,$4,$5) RETURNING id`,
    [kind, req.file.originalname, JSON.stringify(rows), JSON.stringify({ total: rows.length, errors }), req.user!.id]);
  res.json({ jobId: job[0].id, total: rows.length, valid: rows.length - errors.length, errors, sample: rows.slice(0, 10) });
});

adminRouter.post('/import/:kind/:jobId/commit', async (req, res) => {
  const kind = req.params.kind;
  const { rows: jobs } = await pool.query(`SELECT * FROM import_jobs WHERE id=$1 AND kind=$2 AND status='preview'`, [req.params.jobId, kind]);
  if (!jobs[0]) return res.status(404).json({ error: 'Job import tidak ditemukan atau sudah diproses.' });
  const rows = jobs[0].payload as Record<string, unknown>[];
  let created = 0, copies = 0, skipped = 0;

  await tx(async client => {
    if (kind === 'books') {
      for (const row of rows) {
        const title = String(row.Judul || row.judul || '').trim();
        if (!title) { skipped++; continue; }
        const isbn = String(row.ISBN || row.isbn || '').trim() || null;
        const author = String(row.Penulis || row.penulis || '').trim() || null;
        const publisher = String(row.Penerbit || row.penerbit || '').trim() || null;
        const yearRaw = Number(row.Tahun || row.tahun || 0); const pubYear = yearRaw || null;
        const categoryName = String(row.Kategori || row.kategori || '').trim();
        const shelfCode = String(row.Rak || row.rak || '').trim();
        const quantity = Math.max(1, Math.min(Number(row.Jumlah || row.jumlah || 1) || 1, 1000));
        let categoryId = null, shelfId = null;
        if (categoryName) {
          const q = await client.query(`INSERT INTO categories(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [categoryName]); categoryId=q.rows[0].id;
        }
        if (shelfCode) {
          const q = await client.query(`INSERT INTO shelves(code) VALUES($1) ON CONFLICT(code) DO UPDATE SET code=EXCLUDED.code RETURNING id`, [shelfCode]); shelfId=q.rows[0].id;
        }
        let bookId: string | null = null;
        if (isbn) {
          const q = await client.query(`SELECT id FROM books WHERE isbn=$1 LIMIT 1`, [isbn]); bookId=q.rows[0]?.id || null;
        }
        if (!bookId) {
          const q = await client.query(`SELECT id FROM books WHERE lower(title)=lower($1) AND lower(COALESCE(author_text,''))=lower(COALESCE($2,'')) LIMIT 1`, [title,author]); bookId=q.rows[0]?.id || null;
        }
        if (!bookId) {
          const q = await client.query(
            `INSERT INTO books(isbn,title,author_text,publisher,publication_year,category_id,shelf_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [isbn,title,author,publisher,pubYear,categoryId,shelfId]); bookId=q.rows[0].id; created++;
        }
        for (let i=0;i<quantity;i++) {
          const code=await nextCopyCode(client); await client.query(`INSERT INTO book_copies(book_id,copy_code) VALUES($1,$2)`, [bookId,code]); copies++;
        }
      }
    } else if (kind === 'students') {
      const label = currentAcademicYearLabel();
      for (const row of rows) {
        const name = String(row.Nama || row.nama || '').trim();
        if (!name) { skipped++; continue; }
        const nis = String(row.NIS || row.nis || '').trim() || null;
        const nisn = String(row.NISN || row.nisn || '').trim() || null;
        const className = String(row.Kelas || row.kelas || '').trim();
        const genderRaw = String(row.JK || row.jk || '').trim().toUpperCase();
        const gender = ['L','P'].includes(genderRaw) ? genderRaw : null;
        const ayLabel = String(row.TahunAjaran || row.tahunajaran || label).trim() || label;
        const exists = nis ? await client.query(`SELECT id FROM students WHERE nis=$1`, [nis]) : { rows: [] as any[] };
        if (exists.rows[0]) { skipped++; continue; }
        const code = await nextMemberCode(client, 'student');
        const st = await client.query(`INSERT INTO students(member_code,nis,nisn,name,gender) VALUES($1,$2,$3,$4,$5) RETURNING id`, [code,nis,nisn,name,gender]);
        created++;
        if (className) {
          const cl = await client.query(`INSERT INTO classes(name) VALUES($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`, [className]);
          await client.query(`UPDATE academic_years SET is_active=false WHERE is_active=true AND label<>$1`, [ayLabel]);
          const ay = await client.query(`INSERT INTO academic_years(label,is_active) VALUES($1,true) ON CONFLICT(label) DO UPDATE SET is_active=true RETURNING id`, [ayLabel]);
          await client.query(`INSERT INTO student_enrollments(student_id,class_id,academic_year_id) VALUES($1,$2,$3) ON CONFLICT(student_id,academic_year_id) DO UPDATE SET class_id=EXCLUDED.class_id`, [st.rows[0].id,cl.rows[0].id,ay.rows[0].id]);
        }
      }
    }
    await client.query(`UPDATE import_jobs SET status='committed', committed_at=now(), summary=$2 WHERE id=$1`, [req.params.jobId, JSON.stringify({ created,copies,skipped })]);
  });
  await audit(req.user?.id, `import.${kind}`, 'import_job', req.params.jobId, { created,copies,skipped });
  res.json({ ok: true, created, copies, skipped });
});
