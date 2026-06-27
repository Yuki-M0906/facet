/**
 * サブネット間の到達性マトリクス。
 * 元: v3.1.0 の renderMatrix。
 */

import type { MatrixCell, ReachabilityMatrix, Subnet } from '@engine/types';

interface Props {
  matrix: ReachabilityMatrix;
}

function label(s: Subnet): string {
  return (s.vlan ? 'V' + s.vlan + ' ' : '') + s.cidr + (s.zone ? ' (' + s.zone + ')' : '');
}

function sym(c: MatrixCell): { ch: string; cls: string } {
  switch (c) {
    case 'ok': return { ch: '○', cls: 'cell-ok' };
    case 'deny': return { ch: '×', cls: 'cell-deny' };
    case 'nogw': return { ch: '△', cls: 'cell-nogw' };
    case 'self': return { ch: '—', cls: 'cell-self' };
  }
}

export function Matrix({ matrix }: Props) {
  const subs = matrix.subnets;
  if (!subs.length) {
    return <p className="note" style={{ marginTop: 0 }}>L3サブネットが検出されませんでした。</p>;
  }
  return (
    <div className="matrix">
      <table className="mx">
        <thead>
          <tr>
            <th>from \ to</th>
            {subs.map((d) => <th key={d.cidr + '|t'}>{label(d)}</th>)}
          </tr>
        </thead>
        <tbody>
          {subs.map((s) => (
            <tr key={s.cidr + '|s'}>
              <td className="src">{label(s)}</td>
              {subs.map((d) => {
                const c = matrix.cells[s.cidr]?.[d.cidr];
                const { ch, cls } = c ? sym(c) : { ch: '—', cls: 'cell-self' };
                return <td key={s.cidr + '|' + d.cidr}><span className={cls}>{ch}</span></td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
