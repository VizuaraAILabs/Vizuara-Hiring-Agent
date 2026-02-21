import * as fs from 'fs';
import * as path from 'path';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '__pycache__', '.next', 'dist', 'build', '.cache', 'coverage',
]);

const MAX_DEPTH = 10;
const MAX_NODES = 1000;

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.py': 'python',
  '.rb': 'ruby',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.cpp': 'cpp',
  '.h': 'c',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.scala': 'scala',
  '.sh': 'bash',
  '.bash': 'bash',
  '.zsh': 'bash',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.htm': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.less': 'less',
  '.md': 'markdown',
  '.sql': 'sql',
  '.graphql': 'graphql',
  '.dockerfile': 'dockerfile',
  '.env': 'plaintext',
  '.txt': 'plaintext',
  '.csv': 'plaintext',
  '.log': 'plaintext',
  '.ini': 'ini',
  '.cfg': 'ini',
  '.conf': 'plaintext',
  '.lock': 'plaintext',
};

export function buildFileTree(workDir: string): FileNode[] {
  let nodeCount = 0;

  function walk(dir: string, depth: number, relativePath: string): FileNode[] {
    if (depth > MAX_DEPTH || nodeCount >= MAX_NODES) return [];

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return [];
    }

    // Filter hidden files and excluded directories
    entries = entries.filter((e) => {
      if (e.name.startsWith('.')) return false;
      if (e.isDirectory() && EXCLUDED_DIRS.has(e.name)) return false;
      return true;
    });

    // Sort: directories first, then alphabetical
    entries.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    const nodes: FileNode[] = [];
    for (const entry of entries) {
      if (nodeCount >= MAX_NODES) break;
      nodeCount++;

      const entryRelPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const children = walk(fullPath, depth + 1, entryRelPath);
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: 'directory',
          children,
        });
      } else {
        nodes.push({
          name: entry.name,
          path: entryRelPath,
          type: 'file',
        });
      }
    }

    return nodes;
  }

  return walk(workDir, 0, '');
}

const MAX_FILE_SIZE = 500 * 1024; // 500KB

export function readFileContent(workDir: string, filePath: string): {
  path: string;
  content: string;
  language: string;
  truncated: boolean;
  size: number;
} {
  // Path traversal prevention
  const resolved = path.resolve(workDir, filePath);
  if (!resolved.startsWith(path.resolve(workDir))) {
    throw new Error('Path traversal detected');
  }

  if (!fs.existsSync(resolved)) {
    throw new Error('File not found');
  }

  const stat = fs.statSync(resolved);
  if (!stat.isFile()) {
    throw new Error('Not a file');
  }

  // Binary detection: probe first 8KB for null bytes
  const fd = fs.openSync(resolved, 'r');
  const probe = Buffer.alloc(8192);
  const bytesRead = fs.readSync(fd, probe, 0, 8192, 0);
  fs.closeSync(fd);

  for (let i = 0; i < bytesRead; i++) {
    if (probe[i] === 0) {
      throw new Error('Cannot display binary file');
    }
  }

  let truncated = false;
  let content: string;

  if (stat.size > MAX_FILE_SIZE) {
    // Read only first 500KB
    const buf = Buffer.alloc(MAX_FILE_SIZE);
    const fd2 = fs.openSync(resolved, 'r');
    fs.readSync(fd2, buf, 0, MAX_FILE_SIZE, 0);
    fs.closeSync(fd2);
    content = buf.toString('utf-8');
    truncated = true;
  } else {
    content = fs.readFileSync(resolved, 'utf-8');
  }

  const ext = path.extname(resolved).toLowerCase();
  const language = EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';

  // Also detect Dockerfile by name
  const basename = path.basename(resolved).toLowerCase();
  const lang = basename === 'dockerfile' ? 'dockerfile' : language;

  return {
    path: filePath,
    content,
    language: lang,
    truncated,
    size: stat.size,
  };
}
