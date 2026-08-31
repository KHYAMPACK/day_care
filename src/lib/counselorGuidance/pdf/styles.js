import { StyleSheet } from '@react-pdf/renderer';
import { baseStyles, colors } from '../../examReports/pdf/styles.js';

export const sheetColors = {
  sky: { bg: '#dcebff', text: '#215a94', legend: '#eef6ff' },
  lavender: { bg: '#ece7fb', text: '#5b4b8a', legend: '#f5f2fc' },
  mint: { bg: '#d8f3e7', text: '#1f6b4a', legend: '#ecfbf3' },
};

export const guidanceStyles = StyleSheet.create({
  coverMeta: {
    marginBottom: 10,
    padding: 8,
    borderWidth: 0.5,
    borderColor: colors.border,
    borderRadius: 4,
    backgroundColor: colors.rowAlt,
  },
  coverTitle: {
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'center',
    marginBottom: 6,
    color: colors.headerText,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    fontSize: 7,
  },
  metaItem: {
    flexDirection: 'row',
    gap: 3,
  },
  metaLabel: {
    fontWeight: 700,
  },
  sheetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 6,
    marginBottom: 4,
    borderRadius: 3,
  },
  sheetNumber: {
    fontSize: 6,
    fontWeight: 700,
    paddingVertical: 2,
    paddingHorizontal: 6,
    backgroundColor: '#ffffff',
    borderRadius: 8,
  },
  sheetTitle: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.4,
  },
  sheetSubtitle: {
    fontSize: 6,
    color: colors.muted,
    marginBottom: 4,
    lineHeight: 1.35,
  },
  notesBox: {
    marginTop: 6,
    padding: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
    backgroundColor: colors.rowAlt,
    fontSize: 6.5,
    lineHeight: 1.35,
  },
  notesLabel: {
    fontWeight: 700,
    marginBottom: 2,
  },
  emptyHint: {
    fontSize: 7,
    color: colors.muted,
    marginVertical: 8,
    textAlign: 'center',
  },
  matrixTopicCell: {
    fontSize: 5.5,
    lineHeight: 1.2,
  },
  matrixTopicUnit: {
    fontSize: 5,
    color: colors.muted,
    marginTop: 1,
  },
  priorityRow: {
    backgroundColor: '#fde4d6',
  },
  scheduleTime: {
    fontSize: 6,
    fontWeight: 700,
    textAlign: 'center',
  },
  scheduleLabel: {
    fontSize: 5.5,
    lineHeight: 1.25,
    minHeight: 18,
  },
  scheduleDone: {
    fontSize: 5,
    color: colors.muted,
    marginTop: 1,
  },
});

export { baseStyles, colors };
