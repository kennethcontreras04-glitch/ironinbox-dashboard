import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DetectionActions, FlaggedEmail, Incident, Keyword } from '../types';
import { computeEmailStats } from './emailStats';
import { getVisibleSignals } from './keywordSignals';
import { incidentForEmail } from './incidents';

export const generatePDFReport = (
  flaggedEmails: FlaggedEmail[],
  keywords?: Keyword[],
  extras?: {
    releasedCount?: number;
    incidents?: Incident[];
    detectionActions?: DetectionActions;
  }
) => {
  const doc = new jsPDF();
  const keywordList = keywords || [];
  const incidents = extras?.incidents || [];
  const stats = computeEmailStats({
    flaggedEmails,
    releasedCount: extras?.releasedCount || 0,
    keywords: keywordList,
    incidents,
    detectionActions: extras?.detectionActions,
  });

  doc.setFontSize(20);
  doc.setTextColor(37, 99, 235);
  doc.text('IronInbox - Phishing Detection Report', 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
  doc.text(`Mailbox totals: ${stats.totalProcessed} processed · ${stats.totalFlagged} flagged · ${stats.totalReleased} released`, 14, 33);
  doc.text(`Incidents: ${stats.totalIncidents} total · ${stats.openIncidents} open · ${stats.incidentsLinkedToEmails} linked to email`, 14, 38);

  doc.setDrawColor(226, 232, 240);
  doc.line(14, 43, 196, 43);

  let yPos = 53;
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text('Risk Distribution', 14, yPos);

  yPos += 8;
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`Critical Risk: ${stats.criticalCount} emails`, 20, yPos);
  yPos += 6;
  doc.text(`High Risk: ${stats.highCount} emails`, 20, yPos);
  yPos += 6;
  doc.text(`Medium Risk: ${stats.mediumCount} emails`, 20, yPos);
  yPos += 6;
  doc.text(`Low Risk: ${stats.lowCount} emails`, 20, yPos);

  yPos += 12;

  const tableData = flaggedEmails.map((email) => {
    const signals = keywords ? getVisibleSignals(email, keywords, extras?.detectionActions) : email.signals;
    const raw = signals.map((signal) => `${signal.type}: ${signal.value}`).join(', ');
    const sigText = signals.length === 0 ? '—' : (raw.length > 30 ? `${raw.substring(0, 30)}...` : raw);
    const incident = incidentForEmail(incidents, email.id);
    return [
      email.received,
      email.sender.length > 28 ? `${email.sender.substring(0, 25)}...` : email.sender,
      email.subject.length > 32 ? `${email.subject.substring(0, 29)}...` : email.subject,
      sigText,
      email.riskLevel,
      incident ? `${incident.id} · ${incident.status}` : '—',
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [['Time', 'Sender', 'Subject', 'Signals', 'Risk', 'Incident']],
    body: tableData,
    theme: 'grid',
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 34 },
      2: { cellWidth: 38 },
      3: { cellWidth: 32 },
      4: { cellWidth: 18, fontStyle: 'bold' },
      5: { cellWidth: 28 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const risk = data.cell.raw as string;
        switch (risk) {
          case 'Critical':
            data.cell.styles.textColor = [220, 38, 38];
            break;
          case 'High':
            data.cell.styles.textColor = [234, 88, 12];
            break;
          case 'Medium':
            data.cell.styles.textColor = [202, 138, 4];
            break;
          case 'Low':
            data.cell.styles.textColor = [37, 99, 235];
            break;
        }
      }
    },
    margin: { top: 10, bottom: 20, left: 14, right: 14 }
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${i} of ${pageCount}`,
      doc.internal.pageSize.width / 2,
      doc.internal.pageSize.height - 10,
      { align: 'center' }
    );
    doc.text(
      'IronInbox Security System - Confidential',
      14,
      doc.internal.pageSize.height - 10
    );
  }

  doc.save(`IronInbox_Report_${new Date().toISOString().split('T')[0]}.pdf`);
};
