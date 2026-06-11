// src/types.ts

export type FileKind = 'file' | 'dir';

export interface FileNode {
  path: string;               // absolute path — serves as unique id
  name: string;
  kind: FileKind;
  children?: FileNode[];      // only set for directories
}

export interface Workspace {
  root: string;
  name: string;
  tree: FileNode;
  expandedPaths: Set<string>;
}

export interface Document {
  path: string | null;        // null == unsaved draft
  content: string;            // canonical content on disk
  draft: string;              // current editor buffer
  isDirty: boolean;           // draft !== content
  mtime: number;              // unix millis from last read/write
  encoding: 'utf-8';
}

export interface DocumentSession {
  scrollTop: number;
  selection: { anchor: number; head: number };
  lastAccessedAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';
export type EditorWidth = 'narrow' | 'normal' | 'wide' | 'full';

export interface AppConfig {
  theme: ThemeMode;
  fontFamily: string;
  fontSize: number;                // px
  lineHeight: number;              // multiplier, e.g. 1.6
  editorWidth: EditorWidth;
  showSidebar: boolean;
  sidebarWidth: number;            // px
  recentWorkspaces: string[];      // absolute paths, max 10
  lastWorkspace: string | null;
  showHiddenFiles: boolean;
  sessions: Record<string, DocumentSession>;  // key = file absolute path
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  fontSize: 16,
  lineHeight: 1.7, // mixed CJK/Latin needs more leading than Latin-only
  editorWidth: 'normal',
  showSidebar: true,
  sidebarWidth: 260,
  recentWorkspaces: [],
  lastWorkspace: null,
  showHiddenFiles: false,
  sessions: {},
};

export const SESSION_CAP = 200; // LRU limit for sessions map

// IPC result types (mirror Rust structs)
export interface ReadFileResult { content: string; mtime: number; }
export interface WriteFileResult { mtime: number; }
