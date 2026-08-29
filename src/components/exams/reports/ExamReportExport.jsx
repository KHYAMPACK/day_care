import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { REPORT_TYPE_LABELS } from '../../../lib/examReports/reportSchemas';
import { downloadExamPdf, previewExamPdfBlob } from '../../../lib/examReports/pdf/downloadExamPdf';
import { toExamPdfModel } from '../../../lib/examReports/pdf/adapters';
import { MOTION_OVERLAY_MS, usePresence } from '../../../lib/motion';

export default function ExamReportExport({ report, onClose }) {
  const titleId = useId();
  const closeRef = useRef(null);
  const open = Boolean(report);
  const present = usePresence(open, MOTION_OVERLAY_MS);

  const [downloading, setDownloading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState(null);

  const title = report ? (REPORT_TYPE_LABELS[report.type] ?? 'Rapor') : 'Rapor';

  useEffect(() => {
    if (!present) return undefined;

    function onKeyDown(event) {
      if (event.key === 'Escape' && open && !downloading) {
        onClose?.();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (open) closeRef.current?.focus();

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [present, open, downloading, onClose]);

  useEffect(() => {
    if (!report) {
      setPreviewUrl(null);
      setError(null);
      setDownloading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      setDownloading(true);
      setError(null);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });

      try {
        const model = report.header ? report : toExamPdfModel(report);
        const blob = await previewExamPdfBlob(model);
        if (cancelled) return;
        setPreviewUrl(URL.createObjectURL(blob));
      } catch (previewError) {
        if (!cancelled) setError(previewError);
      } finally {
        if (!cancelled) setDownloading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [report]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl]
  );

  async function handleDownload() {
    if (!report) return;
    setDownloading(true);
    setError(null);
    try {
      await downloadExamPdf(report);
    } catch (downloadError) {
      setError(downloadError);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRefreshPreview() {
    if (!report) return;
    setDownloading(true);
    setError(null);
    try {
      const model = report.header ? report : toExamPdfModel(report);
      const blob = await previewExamPdfBlob(model);
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return URL.createObjectURL(blob);
      });
    } catch (previewError) {
      setError(previewError);
    } finally {
      setDownloading(false);
    }
  }

  if (!present) return null;

  return createPortal(
    <div
      className={`app-dialog exam-report-export-modal${open ? '' : ' app-dialog--out'}`}
      role="presentation"
      onClick={open && !downloading ? onClose : undefined}
    >
      <div
        className="exam-report-export-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="exam-report-export-modal__head">
          <div>
            <h2 id={titleId} className="exam-report-export-modal__title">
              {title}
            </h2>
            <p className="dash-hint exam-report-export-modal__lead">
              {downloading && !previewUrl
                ? 'PDF hazırlanıyor…'
                : 'Önizleme hazır — indirebilir veya kapatabilirsiniz.'}
            </p>
          </div>
          <div className="exam-report-export-modal__actions">
            <button
              type="button"
              className="demo-btn"
              onClick={handleRefreshPreview}
              disabled={downloading}
            >
              Yenile
            </button>
            <button type="button" className="demo-btn" onClick={handleDownload} disabled={downloading}>
              {downloading ? 'Hazırlanıyor…' : 'PDF İndir'}
            </button>
            <button ref={closeRef} type="button" className="demo-btn" onClick={onClose} disabled={downloading}>
              Kapat
            </button>
          </div>
        </header>

        {error ? <p className="exam-report-export-modal__error">{error.message ?? String(error)}</p> : null}

        <div className="exam-report-export-modal__body">
          {previewUrl ? (
            <iframe
              className="exam-report-export-modal__preview"
              title={`${title} önizleme`}
              src={previewUrl}
            />
          ) : (
            <div className="exam-report-export-modal__loading" aria-live="polite">
              <span className="exam-report-export-modal__spinner" aria-hidden="true" />
              <p>PDF önizlemesi oluşturuluyor…</p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
