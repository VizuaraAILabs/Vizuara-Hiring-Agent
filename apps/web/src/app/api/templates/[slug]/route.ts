import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { TEMPLATES } from '@/lib/templates';
import fs from 'fs';
import path from 'path';

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.exe', '.dll', '.so', '.dylib',
]);

function readDirRecursive(dir: string, base: string): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      files.push(...readDirRecursive(fullPath, relativePath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        // Skip files with null bytes (likely binary)
        if (content.includes('\0')) continue;
        files.push({ path: relativePath, content });
      } catch {
        // Skip unreadable files
      }
    }
  }

  return files;
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;

    // Validate slug against known templates to prevent directory traversal
    const template = TEMPLATES.find((t) => t.slug === slug);
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    const challengesDir = path.join(process.cwd(), 'challenges', slug);

    if (!fs.existsSync(challengesDir)) {
      return NextResponse.json({ error: 'Template files not found on disk' }, { status: 404 });
    }

    const files = readDirRecursive(challengesDir, '');

    // Find the main instruction file (BRIEF.md, SPEC.md, or README.md) to use as description
    const instructionFile = files.find(
      (f) =>
        f.path === 'BRIEF.md' ||
        f.path === 'SPEC.md' ||
        f.path === 'README.md'
    );

    return NextResponse.json({
      ...template,
      files,
      full_description: instructionFile?.content || template.description,
    });
  } catch (error) {
    console.error('Error loading template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
