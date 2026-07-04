/**
 * バージョン整合性の自動チェック。
 *
 * package.json の version と src/ui/versionHistory.ts の CURRENT_VERSION /
 * 先頭エントリがずれていないかを機械的に検証する。
 *
 * これは「バージョン表記があいまいになる」問題への恒久対策:
 * 過去、複数の機能追加(Sprint 2 / Sprint 5 MVP / GUI ハードニング)が
 * バージョン番号を更新せずコミットされ、CHANGELOG.md 上で同じ "v4.0.0" の下に
 * 異なる日付・内容のセクションが並存する状態になっていた。
 * このテストがある限り、片方だけ更新して npm test が緑になることはない。
 */

import { describe, it, expect } from 'vitest';
import { CURRENT_VERSION, VERSION_HISTORY } from '@ui/versionHistory';
import pkg from '../package.json';

describe('version consistency', () => {
  it('package.json の version と CURRENT_VERSION が一致する', () => {
    expect(pkg.version).toBe(CURRENT_VERSION);
  });

  it('VERSION_HISTORY の先頭エントリが CURRENT_VERSION と一致する(降順の先頭=最新)', () => {
    expect(VERSION_HISTORY[0]!.version).toBe(CURRENT_VERSION);
  });

  it('VERSION_HISTORY にバージョン番号の重複がない', () => {
    const versions = VERSION_HISTORY.map((v) => v.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it('各エントリが version/date/title/changes を持ち、changes は空でない', () => {
    VERSION_HISTORY.forEach((v) => {
      expect(v.version).toBeTruthy();
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.title).toBeTruthy();
      expect(v.changes.length).toBeGreaterThan(0);
    });
  });
});
