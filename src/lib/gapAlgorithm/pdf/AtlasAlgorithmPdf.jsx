import { Document, Page, Text, View } from '@react-pdf/renderer';
import { ALGORITHM_PDF_CONTENT as C } from './algorithmPdfContent';
import { brochureStyles as s } from './styles';

function BulletList({ items = [] }) {
  return (
    <View style={s.bulletList}>
      {items.map((item) => (
        <View key={item} style={s.bulletItem}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function PdfFooter({ pageLabel }) {
  return (
    <View style={s.footer} fixed>
      <Text>Atlas — Öğrenci Gelişim Algoritması</Text>
      <Text>{pageLabel}</Text>
    </View>
  );
}

export function AtlasAlgorithmDocument() {
  const generated = new Date().toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <Document title={C.title} author="Atlas" language="tr">
      <Page size="A4" style={s.page}>
        <Text style={s.coverTitle}>{C.title}</Text>
        <Text style={s.coverSubtitle}>{C.subtitle}</Text>
        <Text style={s.coverTagline}>{C.tagline}</Text>

        <Text style={s.sectionTitle}>{C.problem.title}</Text>
        <Text style={s.paragraph}>{C.problem.intro}</Text>
        <Text style={s.subsectionTitle}>Her öğrenci için otomatik yanıtlanan üç soru</Text>
        <BulletList items={C.problem.questions} />

        <Text style={s.sectionTitle}>{C.layers[0].title}</Text>
        <Text style={s.paragraph}>{C.layers[0].body}</Text>

        <PdfFooter pageLabel={`${generated} · 1/3`} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>{C.layers[1].title}</Text>
        <Text style={s.paragraph}>{C.layers[1].body}</Text>

        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={s.colSignal}>Sinyal</Text>
            <Text style={s.colDesc}>Ne yakalar?</Text>
          </View>
          {C.signals.map((row) => (
            <View key={row.name} style={s.tableRow}>
              <Text style={s.colSignal}>{row.name}</Text>
              <Text style={s.colDesc}>{row.desc}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>{C.layers[2].title}</Text>
        <Text style={s.paragraph}>{C.layers[2].body}</Text>

        <Text style={s.sectionTitle}>{C.layers[3].title}</Text>
        <Text style={s.paragraph}>{C.layers[3].body}</Text>

        <PdfFooter pageLabel={`${generated} · 2/3`} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Farkı ne?</Text>
        <BulletList items={C.differentiators} />

        <Text style={s.sectionTitle}>Okul için sonuç</Text>
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={s.colRole}>Rol</Text>
            <Text style={s.colBefore}>Önce</Text>
            <Text style={s.colAfter}>Bu motorla</Text>
          </View>
          {C.outcomes.map((row) => (
            <View key={row.role} style={s.tableRow}>
              <Text style={s.colRole}>{row.role}</Text>
              <Text style={s.colBefore}>{row.before}</Text>
              <Text style={s.colAfter}>{row.after}</Text>
            </View>
          ))}
        </View>

        <Text style={s.sectionTitle}>Tek cümlelik özet</Text>
        <Text style={s.coverTagline}>{C.tagline}</Text>

        <PdfFooter pageLabel={`${generated} · 3/3`} />
      </Page>
    </Document>
  );
}
