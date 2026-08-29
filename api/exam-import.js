export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { csv, template = 'generic' } = req.body ?? {};
  if (!csv || typeof csv !== 'string') {
    return res.status(400).json({ error: 'csv text required' });
  }

  try {
    const { parseGenericExamCsv, mapCsvRowToEntry } = await import('../src/lib/examImport.js');
    const { rows } = parseGenericExamCsv(csv);
    const entries = rows.map(mapCsvRowToEntry);
    return res.status(200).json({ template, count: entries.length, entries });
  } catch (error) {
    console.error('exam-import error:', error);
    return res.status(500).json({ error: error.message ?? 'Import failed' });
  }
}
