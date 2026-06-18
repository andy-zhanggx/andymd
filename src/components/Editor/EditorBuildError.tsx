interface EditorBuildErrorProps {
  /** The message from the error that aborted the editor build. */
  message: string;
  /** Rebuild the editor for the current document. */
  onReload: () => void;
}

/**
 * Shown in place of the editor when `buildEditor().create()` rejects. Without
 * this the catch handler silently wiped the editor to a blank, uneditable pane
 * (the toolbar and word count still showed, since those read the draft), giving
 * the user no error and no way to recover short of reopening the file. This
 * surfaces the failure and offers an in-place rebuild.
 */
export function EditorBuildError({ message, onReload }: EditorBuildErrorProps) {
  return (
    <div className="editor-build-error" role="alert">
      <p className="editor-build-error__title">This document couldn’t be opened in the editor.</p>
      <p className="editor-build-error__hint">
        The editor failed to load. You can try rebuilding it without restarting the app.
      </p>
      {message && <pre className="editor-build-error__detail">{message}</pre>}
      <button type="button" className="editor-build-error__reload" onClick={onReload}>
        Reload editor
      </button>
    </div>
  );
}
