/**
 * 指摘一覧 + カテゴリフィルタチップ。
 * 元: v3.1.0 の renderFindings + filterbar。
 */

import type { Finding, FindingCategory, FindingLevel, VerifyResult } from '@engine/types';

interface Props {
  result: VerifyResult;
  filter: FindingCategory | 'all';
  onFilter: (f: FindingCategory | 'all') => void;
}

const ORDER: Record<FindingLevel, number> = { err: 0, lack: 1, info: 2, ok: 3 };
const CB: Record<FindingCategory, string> = {
  L1: '物理', L2: 'L2', STP: 'STP', L3: 'L3', FW: 'FW', SEC: 'SEC', CAP: 'CAP',
};
const LV: Record<FindingLevel, string> = {
  err: 'エラー', lack: 'コンフィグ不足', info: '情報', ok: '確認',
};

export function FindingsList({ result, filter, onFilter }: Props) {
  const counts: Record<string, number> = { all: result.findings.length };
  (Object.keys(CB) as FindingCategory[]).forEach((c) => {
    counts[c] = result.findings.filter((f) => f.cat === c).length;
  });

  const sorted: Finding[] = result.findings.slice().sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const list = filter === 'all' ? sorted : sorted.filter((f) => f.cat === filter);

  return (
    <>
      <div className="filterbar">
        <button className={filter === 'all' ? 'on' : ''} onClick={() => onFilter('all')}>
          すべて {counts.all}
        </button>
        {(Object.keys(CB) as FindingCategory[]).map((c) => (
          <button
            key={c}
            className={filter === c ? 'on' : ''}
            onClick={() => onFilter(c)}
          >
            {CB[c]} {counts[c]}
          </button>
        ))}
      </div>
      <div>
        {list.length ? list.map((f, i) => (
          <div key={i} className={'finding ' + f.level}>
            <div className="fh">
              <span className={'badge ' + f.level}>{LV[f.level]}</span>
              <span className="badge cat">{CB[f.cat] || f.cat}</span>
              <span className="loc">{f.where}</span>
            </div>
            <div className="desc">{f.desc}</div>
            {f.why && <div className="why">{f.why}</div>}
            {f.fix && <div className="fix">{f.fix}</div>}
          </div>
        )) : (
          <div className="finding ok">
            <div className="fh"><span className="badge ok">確認</span></div>
            <div className="desc">該当する指摘はありません。</div>
          </div>
        )}
      </div>
    </>
  );
}
