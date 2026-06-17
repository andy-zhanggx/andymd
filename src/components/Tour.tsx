import { useLayoutEffect, useState, type ReactNode } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';

interface Step {
  /** CSS selector for the element to spotlight. Omit for a centered step. */
  selector?: string;
  title: string;
  body: ReactNode;
}

// Bilingual (EN + 中文) so the tour is approachable for first-time / novice
// users. Selectors point at real UI; missing targets fall back to a centered
// card, so the tour never breaks if an element isn't on screen yet.
const STEPS: Step[] = [
  {
    title: 'Welcome to AndyMD 👋',
    body: (
      <>
        A calm, distraction-free Markdown editor. This 30-second tour shows you
        the essentials.
        <span className="tour-sub">欢迎使用 AndyMD —— 一个简洁的 Markdown 编辑器。这个 30 秒小教程带你快速上手。</span>
      </>
    ),
  },
  {
    selector: '[aria-label="Open folder"], .sidebar-empty-action',
    title: '1 · Open a folder',
    body: (
      <>
        Pick a folder to use as your notes workspace. Every Markdown file in it
        shows up in the sidebar on the left.
        <span className="tour-sub">打开一个文件夹作为你的笔记库，里面的 Markdown 文件会显示在左侧。</span>
      </>
    ),
  },
  {
    selector: '[aria-label="New file"]',
    title: '2 · Create a note',
    body: (
      <>
        Click here (or press <kbd>⌘N</kbd>) to make a new note. It appears in the
        sidebar and opens for editing right away.
        <span className="tour-sub">点这里（或按 ⌘N）新建笔记，会自动出现在侧边栏并立即打开编辑。</span>
      </>
    ),
  },
  {
    selector: '[role="tree"], .sidebar-tabs',
    title: '3 · Your files',
    body: (
      <>
        Click any file to open it. <strong>Right-click</strong> a file or folder
        for New File, Rename, Reveal in Finder, and Move to Trash.
        <span className="tour-sub">点击文件即可打开；右键文件或文件夹可新建、重命名、在访达中显示、移到废纸篓。</span>
      </>
    ),
  },
  {
    selector: 'main',
    title: '4 · Just start typing',
    body: (
      <>
        It’s a live editor — type <code># </code> for a heading,
        <code> **bold** </code>, or <code>- </code> for a list, and it renders as
        you go. No Markdown knowledge needed.
        <span className="tour-sub">所见即所得：输入 # 变标题、**加粗**、- 列表，边写边渲染，零基础也能用。</span>
      </>
    ),
  },
  {
    title: '5 · See the raw Markdown',
    body: (
      <>
        Press <kbd>⌘/</kbd> anytime to flip into <strong>Source Code Mode</strong>
        and edit the raw Markdown. Press it again to flip back.
        <span className="tour-sub">随时按 ⌘/ 切换“源码模式”，直接编辑原始 Markdown，再按一次切回。</span>
      </>
    ),
  },
  {
    selector: '.statusbar-help',
    title: 'That’s it! 🎉',
    body: (
      <>
        You’re ready to write. Click the <strong>?</strong> here to replay this
        tour whenever you like.
        <span className="tour-sub">完成啦！想再看一遍教程，点这里的 ? 即可。</span>
      </>
    ),
  },
];

const CARD_WIDTH = 330;
const GAP = 14;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function Tour() {
  const open = useUIStore((s) => s.tourOpen);
  const endTour = useUIStore((s) => s.endTour);
  const update = useConfigStore((s) => s.update);
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const cur = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish() {
    endTour();
    setStep(0);
    void update({ hasSeenTour: true });
  }
  function next() {
    if (isLast) finish();
    else setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }

  // Reset to the first step each time the tour opens.
  useLayoutEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Measure the spotlight target for the current step, keeping it aligned on
  // resize. Re-measures shortly after mount so late-laid-out targets are caught.
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const sel = STEPS[step]?.selector;
      const el = sel ? document.querySelector(sel) : null;
      setRect(el ? el.getBoundingClientRect() : null);
    };
    measure();
    const raf = requestAnimationFrame(measure);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', measure);
    };
  }, [open, step]);

  // Keyboard: Esc skips, ←/→ navigate, Enter advances.
  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); finish(); }
      else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  if (!open) return null;

  // Position the card near the target (below it if there's room, else above),
  // or dead-center when there's no target.
  let cardStyle: React.CSSProperties;
  if (rect) {
    const placeBelow = window.innerHeight - rect.bottom > 200;
    cardStyle = {
      position: 'fixed',
      left: clamp(rect.left, 16, window.innerWidth - CARD_WIDTH - 16),
      ...(placeBelow
        ? { top: rect.bottom + GAP }
        : { bottom: window.innerHeight - rect.top + GAP }),
    };
  } else {
    cardStyle = {
      position: 'fixed',
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <div className="tour-root" role="dialog" aria-modal="true" aria-label="Welcome tour">
      {/* Click-blocker so the tour stays in control; clicks on the dim area are ignored. */}
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div
          className="tour-spot"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      <div className="tour-card" style={{ width: CARD_WIDTH, ...cardStyle }}>
        <h3 className="tour-title">{cur.title}</h3>
        <p className="tour-body">{cur.body}</p>
        <div className="tour-footer">
          <span className="tour-dots">{step + 1} / {STEPS.length}</span>
          <div className="tour-actions">
            {!isLast && (
              <button className="tour-skip" onClick={finish}>Skip</button>
            )}
            {step > 0 && (
              <button className="tour-btn tour-btn-secondary" onClick={back}>Back</button>
            )}
            <button className="tour-btn tour-btn-primary" onClick={next}>
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
