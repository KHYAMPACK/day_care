import { Document, Page, Text, View } from '@react-pdf/renderer';
import { formatReportDateTime } from '../../examReports/pdf/formatReport.js';
import { PdfFooter, PdfTable } from '../../examReports/pdf/PdfTable.jsx';
import { baseStyles, colors, guidanceStyles, sheetColors } from './styles.js';

function SheetBanner({ number, title, variant }) {
  const palette = sheetColors[variant] ?? sheetColors.sky;
  return (
    <View style={[guidanceStyles.sheetBanner, { backgroundColor: palette.bg }]}>
      <Text style={[guidanceStyles.sheetNumber, { color: palette.text }]}>Çizelge {number}</Text>
      <Text style={[guidanceStyles.sheetTitle, { color: palette.text }]}>{title}</Text>
    </View>
  );
}

function CompactHeader({ model }) {
  const { header } = model;
  return (
    <View style={guidanceStyles.compactMeta}>
      <Text style={guidanceStyles.compactMetaText}>
        {header.studentName}
        {header.studentNumber ? ` · No: ${header.studentNumber}` : ''}
        {header.grade ? ` · ${header.grade}. sınıf` : ''}
        {' · '}
        {header.weekIndex}. hafta ({header.weekRangeLabel})
        {header.academicYear ? ` · ${header.academicYear}` : ''}
      </Text>
    </View>
  );
}
function CoverBlock({ model, generatedAt }) {
  const { header } = model;
  return (
    <View style={guidanceStyles.coverMeta}>
      <Text style={guidanceStyles.coverTitle}>Rehberlik planı — haftalık çizelgeler</Text>
      <View style={guidanceStyles.metaGrid}>
        <View style={guidanceStyles.metaItem}>
          <Text style={guidanceStyles.metaLabel}>Öğrenci:</Text>
          <Text>{header.studentName}</Text>
        </View>
        {header.studentNumber ? (
          <View style={guidanceStyles.metaItem}>
            <Text style={guidanceStyles.metaLabel}>Okul no:</Text>
            <Text>{header.studentNumber}</Text>
          </View>
        ) : null}
        {header.grade ? (
          <View style={guidanceStyles.metaItem}>
            <Text style={guidanceStyles.metaLabel}>Sınıf:</Text>
            <Text>{header.grade}</Text>
          </View>
        ) : null}
        <View style={guidanceStyles.metaItem}>
          <Text style={guidanceStyles.metaLabel}>Hafta:</Text>
          <Text>
            {header.weekIndex}. hafta ({header.weekRangeLabel})
          </Text>
        </View>
        <View style={guidanceStyles.metaItem}>
          <Text style={guidanceStyles.metaLabel}>Eğitim yılı:</Text>
          <Text>{header.academicYear}</Text>
        </View>
        <View style={guidanceStyles.metaItem}>
          <Text style={guidanceStyles.metaLabel}>Oluşturulma:</Text>
          <Text>{generatedAt}</Text>
        </View>
      </View>
    </View>
  );
}

function QuestionSheet({ model }) {
  const columns = [
    { key: 'num', label: '#', width: '4%', align: 'center' },
    { key: 'subject', label: 'DERS', width: '11%' },
    { key: 'topic', label: 'KONU', width: '14%' },
    { key: 'source', label: 'SORU KAYNAĞI', width: '14%' },
    { key: 'target', label: 'ÇÖZÜLECEK', width: '8%', align: 'center' },
    { key: 'solved', label: 'ÇÖZÜLEN', width: '8%', align: 'center' },
    { key: 'correct', label: 'DOĞRU', width: '7%', align: 'center' },
    { key: 'wrong', label: 'YANLIŞ', width: '7%', align: 'center' },
    { key: 'blank', label: 'BOŞ', width: '7%', align: 'center' },
    { key: 'status', label: 'DURUM', width: '10%' },
  ];

  return (
    <View>
      <SheetBanner number={1} title="SORU TAKİP" variant="sky" />
      <Text style={guidanceStyles.sheetSubtitle}>
        Her satır bir ders/konu hedefi. Çözülecek = hedef; çözülen ve D/Y/B = gerçekleşen.
      </Text>
      {model.questions.length ? (
        <PdfTable columns={columns} rows={model.questions} />
      ) : (
        <Text style={guidanceStyles.emptyHint}>Bu hafta için soru takip satırı yok.</Text>
      )}
      {model.notes ? (
        <View style={guidanceStyles.notesBox}>
          <Text style={guidanceStyles.notesLabel}>Hafta notu</Text>
          <Text>{model.notes}</Text>
        </View>
      ) : null}
    </View>
  );
}

function MatrixSheet({ matrix }) {
  const resources = matrix.resources ?? [];

  return (
    <View>
      <SheetBanner number={2} title="KONU / KAYNAK TAKİP" variant="lavender" />
      <Text style={guidanceStyles.sheetSubtitle}>
        Ders: {matrix.subjectName} · Boş = başlamadı · ▣ = devam · ✓ = tamam
      </Text>
      {!resources.length ? (
        <Text style={guidanceStyles.emptyHint}>Kaynak sütunu tanımlanmamış.</Text>
      ) : (
        <View style={baseStyles.table}>
          <View style={baseStyles.tableHeaderRow}>
            <View style={[baseStyles.cellHeader, { width: '22%', flex: 0.22 }]}>
              <Text>KONU ↓ / KAYNAK →</Text>
            </View>
            {resources.map((resource) => (
              <View
                key={resource}
                style={[
                  baseStyles.cellHeader,
                  { flex: 1, width: `${78 / resources.length}%` },
                ]}
              >
                <Text wrap>{resource}</Text>
              </View>
            ))}
          </View>
          {(matrix.rows ?? []).map((row, rowIndex) => (
            <View
              key={row.topicKey ?? rowIndex}
              style={[
                baseStyles.tableRow,
                rowIndex % 2 === 1 ? { backgroundColor: colors.rowAlt } : null,
                row.isPriority ? guidanceStyles.priorityRow : null,
              ]}
            >
              <View style={[baseStyles.cell, { width: '22%', flex: 0.22 }]}>
                <Text style={guidanceStyles.matrixTopicCell}>{row.topicLabel}</Text>
                {row.unitTitle ? (
                  <Text style={guidanceStyles.matrixTopicUnit}>{row.unitTitle}</Text>
                ) : null}
              </View>
              {row.cells.map((cell) => (
                <View
                  key={`${row.topicKey}-${cell.resource}`}
                  style={[baseStyles.cell, baseStyles.cellCenter, { flex: 1 }]}
                >
                  <Text>{cell.symbol || '·'}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ScheduleSheet({ schedule }) {
  const days = schedule.days ?? [];
  const dayWidth = `${Math.floor(86 / Math.max(days.length, 1))}%`;

  return (
    <View>
      <SheetBanner number={3} title="HAFTALIK ÇALIŞMA PROGRAMI" variant="mint" />
      <Text style={guidanceStyles.sheetSubtitle}>
        Satırlar = saat aralığı · Sütunlar = günler · ✓ = tamamlandı
      </Text>
      {!schedule.slots?.length ? (
        <Text style={guidanceStyles.emptyHint}>Program satırı yok.</Text>
      ) : (
        <View style={baseStyles.table}>
          <View style={baseStyles.tableHeaderRow}>
            <View style={[baseStyles.cellHeader, { width: '14%', flex: 0.14 }]}>
              <Text>SAAT</Text>
            </View>
            {days.map((day) => (
              <View key={day.id} style={[baseStyles.cellHeader, { width: dayWidth, flex: 1 }]}>
                <Text>{day.label}</Text>
              </View>
            ))}
          </View>
          {schedule.slots.map((slot, slotIndex) => (
            <View
              key={`${slot.start_time}-${slot.end_time}-${slotIndex}`}
              style={[
                baseStyles.tableRow,
                slotIndex % 2 === 1 ? { backgroundColor: colors.rowAlt } : null,
              ]}
            >
              <View style={[baseStyles.cell, { width: '14%', flex: 0.14 }]}>
                <Text style={guidanceStyles.scheduleTime}>
                  {slot.start_time} – {slot.end_time}
                </Text>
              </View>
              {slot.days.map((dayCell, dayIndex) => (
                <View key={days[dayIndex]?.id ?? dayIndex} style={[baseStyles.cell, { flex: 1 }]}>
                  <Text style={guidanceStyles.scheduleLabel}>{dayCell.label || '—'}</Text>
                  {dayCell.done ? <Text style={guidanceStyles.scheduleDone}>✓ Tamam</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** @param {{ model: ReturnType<import('./buildGuidancePdfModel.js').buildGuidancePdfModel>, sheet?: 'all' | 'questions' | 'matrix' | 'schedule' }} props */
export function GuidanceWorkbookPdf({ model, sheet = 'all' }) {
  const generatedAt = formatReportDateTime(new Date());
  const schoolName = model.header.schoolName || 'Atlas';
  const includeQuestions = sheet === 'all' || sheet === 'questions';
  const includeMatrix = sheet === 'all' || sheet === 'matrix';
  const includeSchedule = sheet === 'all' || sheet === 'schedule';
  const singleSheet = sheet !== 'all';

  return (
    <Document title={model.filename}>
      {includeQuestions ? (
        <Page size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          {singleSheet ? <CompactHeader model={model} /> : <CoverBlock model={model} generatedAt={generatedAt} />}
          <QuestionSheet model={model} />
          <PdfFooter schoolName={schoolName} generatedAt={generatedAt} />
        </Page>
      ) : null}

      {includeMatrix ? (
        <Page size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          {singleSheet ? <CompactHeader model={model} /> : null}
          <MatrixSheet matrix={model.matrix} />
          <PdfFooter schoolName={schoolName} generatedAt={generatedAt} />
        </Page>
      ) : null}

      {includeSchedule ? (
        <Page size="A4" orientation="landscape" style={baseStyles.pageLandscape}>
          {singleSheet ? <CompactHeader model={model} /> : null}
          <ScheduleSheet schedule={model.schedule} />
          <PdfFooter schoolName={schoolName} generatedAt={generatedAt} />
        </Page>
      ) : null}
    </Document>
  );
}
