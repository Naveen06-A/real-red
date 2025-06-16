import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import moment from 'moment';
import logo from '../assets/logo.png';

export const generatePdf = async (title: string, head: any[], body: any[][], fileName: string, outputType: 'save' | 'blob' = 'save') => {
  const doc = new jsPDF();

  // Add logo
  const img = new Image();
  img.src = logo;
  await new Promise((resolve) => {
    img.onload = resolve;
  });
  doc.addImage(img, 'PNG', 10, 10, 40, 20);

  // Add title
  doc.setFontSize(20);
  doc.text(title, 60, 20);

  // Add generation date
  doc.setFontSize(10);
  doc.text(`Generated on: ${moment().format('MMMM Do YYYY, h:mm:ss a')}`, 60, 30);

  // Add table
  autoTable(doc, {
    head,
    body,
    startY: 40,
    theme: 'grid',
    headStyles: { fillColor: [22, 160, 133] },
  });

  if (outputType === 'blob') {
    return doc.output('blob');
  } else {
    // Save the PDF
    doc.save(fileName);
  }
};