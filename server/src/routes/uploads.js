import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync, writeFileSync, mkdirSync } from 'fs';
import { isAbsolute, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Uploads location. Set UPLOAD_DIR in the environment to keep user media OUTSIDE
// the deploy directory so re-deploys don't wipe uploaded images/files.
const uploadDir = process.env.UPLOAD_DIR
  ? (isAbsolute(process.env.UPLOAD_DIR) ? process.env.UPLOAD_DIR : resolve(process.cwd(), process.env.UPLOAD_DIR))
  : join(__dirname, '../../uploads');
try { mkdirSync(uploadDir, { recursive: true }); } catch {}

// Store uploads in memory first so sharp can process before writing to disk
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];

const router = Router();

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  const isImage = IMAGE_MIME.includes(req.file.mimetype);

  let filename, buffer;

  if (isImage) {
    // Convert to WebP at 82% quality — good balance of size vs quality
    filename = `${unique}.webp`;
    buffer = await sharp(req.file.buffer)
      .webp({ quality: 82 })
      .toBuffer();
  } else {
    // Non-image (e.g. PDF) — store as-is
    const ext = req.file.originalname.split('.').pop().toLowerCase();
    filename = `${unique}.${ext}`;
    buffer = req.file.buffer;
  }

  writeFileSync(join(uploadDir, filename), buffer);

  res.json({
    filename,
    originalName: req.file.originalname,
    size: buffer.length,
    url: `/uploads/${filename}`,
  });
});

router.delete('/:filename', (req, res) => {
  const filepath = join(uploadDir, req.params.filename);
  if (existsSync(filepath)) unlinkSync(filepath);
  res.json({ success: true });
});

export default router;
