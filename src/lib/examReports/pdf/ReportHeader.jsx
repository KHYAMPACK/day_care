import { Text, View } from '@react-pdf/renderer';
import { baseStyles, chartStyles, headerStyles } from './styles';

/** @param {{ schoolName: string, reportTitle?: string, subtitle?: string, meta?: { label: string, value: string }[] }} props */
export function ReportHeader({ schoolName, reportTitle, subtitle, meta = [] }) {
  return (
    <View style={headerStyles.container}>
      <View style={headerStyles.titleBlock}>
        <Text style={baseStyles.schoolTitle}>{schoolName}</Text>
      </View>
      {reportTitle ? (
        <View style={headerStyles.titleBlock}>
          <Text style={baseStyles.reportTitle}>{reportTitle}</Text>
        </View>
      ) : null}
      {subtitle ? (
        <View style={headerStyles.titleBlock}>
          <Text style={headerStyles.subtitle}>{subtitle}</Text>
        </View>
      ) : null}
      {meta.length ? (
        <View style={headerStyles.metaRow}>
          {meta.map((item) => (
            <View key={item.label} style={headerStyles.metaChip}>
              <Text style={headerStyles.metaLabel}>{item.label}</Text>
              <Text style={headerStyles.metaValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
