import { execFile } from 'child_process';

export function notify(title: string, message: string): void {
  // バックスラッシュ → ダブルクォート → 改行・復帰の順でエスケープ/除去する。
  // AppleScript の文字列リテラル内で改行はSyntaxErrorになるため空白に置換する。
  const escape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]/g, ' ');
  const script = `display notification "${escape(message)}" with title "${escape(title)}"`;
  execFile('osascript', ['-e', script], () => {});
}
