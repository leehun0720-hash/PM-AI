// 가져오기 1단계: 파일 글자 → 줄×칸 표. 브라우저 안에서만 처리한다(파일을 밖으로 보내지 않음).

export interface Table { headers: string[]; rows: string[][]; headerRow: number }

/** BOM을 지우고 UTF-8로 읽는다. UTF-8이 아니면(한글 엑셀 기본 저장) EUC-KR로 다시 읽는다. */
export function decodeText(buf: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    text = new TextDecoder('euc-kr').decode(buf);
  }
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** CSV → 줄×칸. 따옴표 속 쉼표·줄바꿈, "" 이스케이프, \r\n 처리. */
export function parseCsv(text: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); grid.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); grid.push(row); }
  return grid;
}

const filled = (r: string[]) => r.filter((c) => c.trim() !== '').length;

/** 위 20줄 안에서 아는 열 이름이 가장 많은 줄. 2칸 이상 맞는 줄이 없으면 처음으로 2칸 이상 채워진 줄. 없으면 -1. */
export function findHeaderRow(grid: string[][], known: (h: string) => boolean): number {
  let best = -1;
  let bestScore = 1;
  grid.slice(0, 20).forEach((r, i) => {
    const score = r.filter((c) => c.trim() && known(c)).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  if (best >= 0) return best;
  return grid.slice(0, 20).findIndex((r) => filled(r) >= 2);
}

export function toTable(grid: string[][], known: (h: string) => boolean): Table {
  const headerRow = findHeaderRow(grid, known);
  if (headerRow < 0) return { headers: [], rows: [], headerRow: -1 };
  const headers = grid[headerRow].map((h) => h.trim());
  const rows = grid.slice(headerRow + 1).filter((r) => filled(r) > 0);
  return { headers, rows, headerRow };
}
