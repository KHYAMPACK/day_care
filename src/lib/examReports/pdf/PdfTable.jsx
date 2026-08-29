import { Text, View } from '@react-pdf/renderer';
import { baseStyles, colors } from './styles';

function HeaderCell({ label, width, flex }) {
  return (
    <View
      style={[
        baseStyles.cellHeader,
        { width, flex: typeof width === 'string' ? undefined : flex ?? width },
      ]}
    >
      <Text wrap>{label}</Text>
    </View>
  );
}

/**
 * @param {{
 *   columns: { key: string, label: string, width: string|number, align?: 'left'|'center'|'right', render?: (row: any) => any }[],
 *   rows: any[],
 *   headerRows?: { cells: { label: string, width: string|number, colSpan?: number }[] }[][],
 *   getRowStyle?: (row: any, rowIndex: number) => object | null,
 * }} props
 */
export function PdfTable({ columns, rows, headerRows, getRowStyle }) {
  return (
    <View style={baseStyles.table}>
      {headerRows?.map((headerRow, rowIndex) => (
        <View key={`hdr-${rowIndex}`} style={baseStyles.tableHeaderRow}>
          {headerRow.flatMap((cell, cellIndex) => {
            const span = cell.colSpan ?? 1;
            const cells = [];
            for (let i = 0; i < span; i += 1) {
              cells.push(
                <HeaderCell
                  key={`${rowIndex}-${cellIndex}-${i}`}
                  label={i === 0 ? cell.label : ''}
                  width={i === 0 ? cell.width : columns[cellIndex + i]?.width ?? cell.width}
                />
              );
            }
            return cells;
          })}
        </View>
      ))}

      {!headerRows ? (
        <View style={baseStyles.tableHeaderRow}>
          {columns.map((col) => (
            <HeaderCell key={col.key} label={col.label} width={col.width} />
          ))}
        </View>
      ) : null}

      {rows.map((row, rowIndex) => (
        <View
          key={row.id ?? rowIndex}
          style={[
            baseStyles.tableRow,
            rowIndex % 2 === 1 ? { backgroundColor: colors.rowAlt } : null,
            getRowStyle?.(row, rowIndex),
          ]}
          wrap={false}
        >
          {columns.map((col) => {
            const raw = col.render ? col.render(row) : row[col.key];
            const alignStyle =
              col.align === 'right'
                ? baseStyles.cellRight
                : col.align === 'center'
                  ? baseStyles.cellCenter
                  : null;
            const isNode = raw != null && typeof raw === 'object';
            return (
              <View
                key={col.key}
                style={[
                  baseStyles.cell,
                  { width: col.width, flex: typeof col.width === 'string' ? undefined : col.width },
                ]}
              >
                {isNode ? raw : <Text style={alignStyle}>{raw ?? '—'}</Text>}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function PdfFooter({ schoolName, generatedAt }) {
  return (
    <View style={baseStyles.footer} fixed>
      <Text>{generatedAt}</Text>
      <Text>{schoolName}</Text>
    </View>
  );
}
